import { beforeEach, describe, expect, it } from 'vitest';
import type { NormalisedInteraction } from './ingest-pipeline';
import {
  accumulateInteractions,
  findPromptBoundary,
  foldSubagentTree,
  foldTimestampEnvelope,
  normaliseInteractions,
  type InteractionDialect,
  type PendingInteraction,
  type SubagentDisclosure,
  type SubagentTopology,
} from './interaction-accumulator';
import { nullTokenBuckets } from './token-buckets';

interface TestRecord {
  kind?: string;
  id?: string;
  cwd?: string;
  timestamp?: unknown;
  message?: {
    model?: unknown;
    usage?: Record<string, unknown>;
  };
}

const dialect: InteractionDialect<TestRecord> = {
  harness: 'pi',
  isGenuinePrompt: (record) => record.kind === 'prompt',
  isMainAssistant: (record) => record.kind === 'assistant',
  openInteraction(record, { filePath, defaultCwd }) {
    if (record.id === undefined) {
      throw new Error(`prompt has no id: ${filePath}`);
    }
    return {
      interactionKey: record.id,
      cwd: record.cwd ?? defaultCwd,
      timestamp: Date.parse(String(record.timestamp)),
      assistants: [],
      records: [],
    };
  },
  tokenWireKeys: [
    ['input', 'in'],
    ['output', 'out'],
    ['cacheRead', 'read'],
    ['cacheWrite', 'write'],
  ],
  outputWireKey: 'out',
  parseRecord: (line) => JSON.parse(line) as TestRecord,
};

const context = { filePath: '/logs/session.jsonl', defaultCwd: '/work/alpha' };

const noSubagents: SubagentDisclosure<TestRecord> = () => ({
  subTokens: nullTokenBuckets(),
  spawnedSubagents: false,
});

function prompt(id: string, extra: Partial<TestRecord> = {}): TestRecord {
  return {
    kind: 'prompt',
    id,
    timestamp: '2025-01-01T00:00:00.000Z',
    ...extra,
  };
}

function assistant(
  model: string,
  usage: Record<string, unknown> = {},
): TestRecord {
  return { kind: 'assistant', message: { model, usage } };
}

/** The single settled Interaction these records open, answer and disclose. */
function normaliseOne(
  records: readonly TestRecord[],
  disclose: SubagentDisclosure<TestRecord> = noSubagents,
): NormalisedInteraction {
  const [interaction] = normaliseInteractions(
    accumulateInteractions(records, dialect, context),
    dialect,
    context.filePath,
    disclose,
  );
  return interaction;
}

describe('accumulating Interactions', () => {
  describe('records that precede the slice\u2019s first prompt', () => {
    it('open no Interaction', () => {
      expect(
        accumulateInteractions(
          [assistant('claude-opus-4-8'), { kind: 'tool' }],
          dialect,
          context,
        ),
      ).toEqual([]);
    });
  });

  describe('a prompt an assistant answered', () => {
    let accumulated: PendingInteraction<TestRecord>[];

    beforeEach(() => {
      accumulated = accumulateInteractions(
        [
          prompt('one'),
          { kind: 'tool' },
          assistant('claude-opus-4-8', { out: 4 }),
          assistant('claude-opus-4-8', { out: 6 }),
        ],
        dialect,
        context,
      );
    });

    it('closes as the slice\u2019s only Interaction', () => {
      expect(accumulated).toHaveLength(1);
    });

    it('is keyed by the prompt that opened it', () => {
      expect(accumulated[0].interactionKey).toBe('one');
    });

    it('counts every main-agent response among its assistants', () => {
      expect(accumulated[0].assistants).toHaveLength(2);
    });

    it('gathers what answered it without the opening prompt', () => {
      // The opening prompt is the boundary, not part of what answered it.
      expect(accumulated[0].records).toHaveLength(3);
    });
  });

  describe('a prompt nothing answered', () => {
    it('is dropped when a later prompt closes it', () => {
      const accumulated = accumulateInteractions(
        [
          prompt('unanswered'),
          prompt('answered'),
          assistant('claude-opus-4-8'),
        ],
        dialect,
        context,
      );

      expect(accumulated.map((pending) => pending.interactionKey)).toEqual([
        'answered',
      ]);
    });

    it('is dropped when the slice ends with it still open', () => {
      const accumulated = accumulateInteractions(
        [
          prompt('answered'),
          assistant('claude-opus-4-8'),
          prompt('still-running'),
        ],
        dialect,
        context,
      );

      expect(accumulated.map((pending) => pending.interactionKey)).toEqual([
        'answered',
      ]);
    });
  });

  describe('a prompt that carries no cwd', () => {
    it('opens an Interaction rooted at the Session cwd', () => {
      const accumulated = accumulateInteractions(
        [prompt('inherits'), assistant('claude-opus-4-8')],
        dialect,
        context,
      );

      expect(accumulated.map((pending) => pending.cwd)).toEqual([
        '/work/alpha',
      ]);
    });
  });

  describe('a prompt that declares its own cwd', () => {
    it('opens an Interaction rooted there rather than at the Session cwd', () => {
      const accumulated = accumulateInteractions(
        [
          prompt('declares', { cwd: '/work/beta' }),
          assistant('claude-opus-4-8'),
        ],
        dialect,
        context,
      );

      expect(accumulated.map((pending) => pending.cwd)).toEqual(['/work/beta']);
    });
  });

  describe('a prompt the dialect rejects as corrupt', () => {
    it('opens nothing and names the file it was read from', () => {
      expect(() =>
        accumulateInteractions([{ kind: 'prompt' }], dialect, context),
      ).toThrow('prompt has no id: /logs/session.jsonl');
    });
  });
});

describe('normalising Interactions', () => {
  describe('an Interaction several assistants answered', () => {
    let interaction: NormalisedInteraction;

    beforeEach(() => {
      interaction = normaliseOne([
        prompt('one'),
        assistant('claude-opus-4-8', { in: 10, out: 2, write: 3 }),
        assistant('claude-opus-4-8', { out: 20, read: 5 }),
      ]);
    });

    it('totals a bucket across every assistant that reported it', () => {
      expect(interaction.mainTokens.output).toBe(22);
    });

    it('fills each bucket from the wire key the dialect pairs with it', () => {
      expect(interaction.mainTokens).toEqual({
        input: 10,
        output: 22,
        cacheRead: 5,
        cacheWrite: 3,
      });
    });
  });

  describe('an Interaction several Models answered', () => {
    let interaction: NormalisedInteraction;

    beforeEach(() => {
      interaction = normaliseOne([
        prompt('one'),
        assistant('claude-haiku-4-5', { out: 12 }),
        assistant('claude-opus-4-8-20250101', { out: 10 }),
        assistant('claude-opus-4-8[1m]', { out: 8 }),
      ]);
    });

    it('names the Model the serving-Model rule chose from every assistant', () => {
      expect(interaction.model).toBe('claude-opus-4-8');
    });

    it('keeps the raw spelling that Model was written with', () => {
      expect(interaction.modelRaw).toBe('claude-opus-4-8-20250101');
    });
  });

  describe('an Interaction no Model answered', () => {
    it('is rejected, naming the Harness and the file it was read from', () => {
      const pendingInteractions = accumulateInteractions(
        [prompt('one'), { kind: 'assistant' }],
        dialect,
        context,
      );

      expect(() =>
        normaliseInteractions(
          pendingInteractions,
          dialect,
          context.filePath,
          noSubagents,
        ),
      ).toThrow('Responded pi Interaction has no model: /logs/session.jsonl');
    });
  });

  describe('an Interaction whose Session discloses sub-agent activity', () => {
    let interaction: NormalisedInteraction;

    beforeEach(() => {
      interaction = normaliseOne(
        [prompt('one'), assistant('claude-opus-4-8', { out: 1 })],
        () => ({
          subTokens: { input: 4, output: 5, cacheRead: null, cacheWrite: null },
          spawnedSubagents: true,
        }),
      );
    });

    it('takes the sub-agent Token buckets from the disclosure', () => {
      expect(interaction.subTokens).toEqual({
        input: 4,
        output: 5,
        cacheRead: null,
        cacheWrite: null,
      });
    });

    it('takes the spawned-sub-agents flag from the disclosure', () => {
      expect(interaction.spawnedSubagents).toBe(true);
    });
  });
});

describe('folding the timestamp envelope', () => {
  const seed = Date.parse('2025-01-01T00:00:00.000Z');

  /** Every shape of `timestamp` the fold refuses to read as a date. */
  const undatable = [
    { description: 'a string that is no date', timestamp: 'not a timestamp' },
    { description: 'a numeric timestamp', timestamp: 7 },
    { description: 'no timestamp at all', timestamp: undefined },
  ];

  describe('an envelope seeded from the Session\u2019s metadata', () => {
    it('widens to cover every record it can date', () => {
      expect(
        foldTimestampEnvelope(
          [
            { timestamp: '2025-01-01T00:00:05.000Z' },
            { timestamp: 'not a timestamp' },
            { timestamp: 7 },
            { timestamp: '2025-01-01T00:00:01.000Z' },
          ],
          seed,
        ),
      ).toEqual({
        startedAt: Date.parse('2025-01-01T00:00:00.000Z'),
        endedAt: Date.parse('2025-01-01T00:00:05.000Z'),
      });
    });

    it.each(undatable)(
      'stays where the seed put it given $description',
      ({ timestamp }) => {
        expect(foldTimestampEnvelope([{ timestamp }], seed)).toEqual({
          startedAt: seed,
          endedAt: seed,
        });
      },
    );
  });

  describe('an envelope with nothing seeded', () => {
    it('takes its whole span from the records it can date', () => {
      expect(
        foldTimestampEnvelope(
          [{ timestamp: '2025-01-01T00:00:02.000Z' }],
          null,
        ),
      ).toEqual({
        startedAt: Date.parse('2025-01-01T00:00:02.000Z'),
        endedAt: Date.parse('2025-01-01T00:00:02.000Z'),
      });
    });

    it.each(undatable)(
      'is reported absent when the records hold only $description',
      ({ timestamp }) => {
        expect(foldTimestampEnvelope([{ timestamp }], null)).toEqual({
          startedAt: null,
          endedAt: null,
        });
      },
    );
  });
});

describe('finding the prompt boundary', () => {
  const lines = [
    JSON.stringify({ kind: 'session' }),
    JSON.stringify(prompt('first')),
    JSON.stringify(assistant('claude-opus-4-8')),
    JSON.stringify(prompt('second')),
    JSON.stringify(assistant('claude-opus-4-8')),
  ];
  const contents = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
  const offsets = lines.reduce<number[]>(
    (starts, line) => [...starts, starts[starts.length - 1] + line.length + 1],
    [0],
  );

  describe('a scanned range holding genuine prompts', () => {
    it('rewinds to the last of them', () => {
      expect(findPromptBoundary(contents, contents.length, dialect)).toBe(
        offsets[3],
      );
    });

    it('passes over one that starts at or after the scan limit', () => {
      expect(findPromptBoundary(contents, offsets[3], dialect)).toBe(
        offsets[1],
      );
    });
  });

  describe('a scanned range holding no genuine prompt', () => {
    it('sends the read back to the start of the file', () => {
      expect(findPromptBoundary(contents, offsets[1], dialect)).toBe(0);
    });
  });
});

describe('folding the sub-agent tree', () => {
  interface Agent {
    key: string;
    assistants: TestRecord[];
    children: string[];
  }

  function topologyOf(
    agents: Agent[],
  ): SubagentTopology<string, Agent, TestRecord> {
    return {
      resolve: (name, parent) =>
        agents.find(
          (agent) =>
            agent.key === (parent === null ? name : `${parent.key}.${name}`),
        ) ?? null,
      keyOf: (agent) => agent.key,
      assistantsOf: (agent) => agent.assistants,
      childrenOf: (agent) => agent.children,
    };
  }

  describe('a reference to a node not yet walked', () => {
    it('collects assistants depth-first from every root', () => {
      const agents: Agent[] = [
        { key: 'a', assistants: [{ id: 'a' }], children: ['x'] },
        { key: 'a.x', assistants: [{ id: 'a.x' }], children: [] },
        { key: 'b', assistants: [{ id: 'b' }], children: [] },
      ];

      expect(
        foldSubagentTree(['a', 'b'], topologyOf(agents)).map(
          (record) => record.id,
        ),
      ).toEqual(['a', 'a.x', 'b']);
    });

    it('is scoped to the node that spawned it', () => {
      const agents: Agent[] = [
        { key: 'a', assistants: [], children: ['worker'] },
        { key: 'a.worker', assistants: [{ id: 'a.worker' }], children: [] },
        { key: 'b.worker', assistants: [{ id: 'b.worker' }], children: [] },
      ];

      expect(
        foldSubagentTree(['a'], topologyOf(agents)).map((record) => record.id),
      ).toEqual(['a.worker']);
    });
  });

  describe('a reference to a node already walked', () => {
    it('counts that node once however many references reach it', () => {
      const agents: Agent[] = [
        { key: 'a', assistants: [{ id: 'a' }], children: ['x', 'x'] },
        { key: 'a.x', assistants: [{ id: 'a.x' }], children: [] },
      ];

      expect(
        foldSubagentTree(['a', 'a'], topologyOf(agents)).map(
          (record) => record.id,
        ),
      ).toEqual(['a', 'a.x']);
    });

    it('terminates the walk rather than recurring forever on a cycle', () => {
      const agents: Agent[] = [
        { key: 'a', assistants: [{ id: 'a' }], children: ['a'] },
      ];
      const cyclic: SubagentTopology<string, Agent, TestRecord> = {
        ...topologyOf(agents),
        resolve: (name) => agents.find((agent) => agent.key === name) ?? null,
      };

      expect(
        foldSubagentTree(['a'], cyclic).map((record) => record.id),
      ).toEqual(['a']);
    });
  });

  describe('a reference that names no node', () => {
    it('contributes nothing as a root', () => {
      const agents: Agent[] = [
        { key: 'a', assistants: [{ id: 'a' }], children: [] },
      ];

      expect(
        foldSubagentTree(['a', 'absent'], topologyOf(agents)).map(
          (record) => record.id,
        ),
      ).toEqual(['a']);
    });

    it('contributes nothing as a child', () => {
      const agents: Agent[] = [
        { key: 'a', assistants: [{ id: 'a' }], children: ['missing'] },
      ];

      expect(
        foldSubagentTree(['a'], topologyOf(agents)).map((record) => record.id),
      ).toEqual(['a']);
    });
  });
});
