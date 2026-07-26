import { describe, expect, it } from 'vitest';
import {
  accumulateInteractions,
  findPromptBoundary,
  foldSubagentTree,
  foldTimestampEnvelope,
  normaliseInteractions,
  type InteractionDialect,
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

describe('accumulating Interactions', () => {
  it('opens an Interaction on a genuine prompt and gathers what answered it', () => {
    const [interaction, ...rest] = accumulateInteractions(
      [
        prompt('one'),
        { kind: 'tool' },
        assistant('claude-opus-4-8', { out: 4 }),
        assistant('claude-opus-4-8', { out: 6 }),
      ],
      dialect,
      context,
    );

    expect(rest).toEqual([]);
    expect(interaction.interactionKey).toBe('one');
    expect(interaction.assistants).toHaveLength(2);
    // The opening prompt is the boundary, not part of what answered it.
    expect(interaction.records).toHaveLength(3);
  });

  it('drops a prompt nothing responded to, including the last one', () => {
    const accumulated = accumulateInteractions(
      [
        prompt('unanswered'),
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

  it('ignores records that precede the slice\u2019s first prompt', () => {
    const accumulated = accumulateInteractions(
      [assistant('claude-opus-4-8'), { kind: 'tool' }],
      dialect,
      context,
    );

    expect(accumulated).toEqual([]);
  });

  it('falls back to the Session cwd only when the prompt carries none', () => {
    const accumulated = accumulateInteractions(
      [
        prompt('inherits'),
        assistant('claude-opus-4-8'),
        prompt('declares', { cwd: '/work/beta' }),
        assistant('claude-opus-4-8'),
      ],
      dialect,
      context,
    );

    expect(accumulated.map((pending) => pending.cwd)).toEqual([
      '/work/alpha',
      '/work/beta',
    ]);
  });

  it('lets the dialect reject a corrupt prompt', () => {
    expect(() =>
      accumulateInteractions([{ kind: 'prompt' }], dialect, context),
    ).toThrow('prompt has no id: /logs/session.jsonl');
  });
});

describe('normalising Interactions', () => {
  it('sums the main agent\u2019s tokens through the dialect\u2019s wire keys', () => {
    const [interaction] = normaliseInteractions(
      accumulateInteractions(
        [
          prompt('one'),
          assistant('claude-opus-4-8', { in: 10, out: 2, write: 3 }),
          assistant('claude-opus-4-8', { out: 20, read: 5 }),
        ],
        dialect,
        context,
      ),
      dialect,
      context.filePath,
      noSubagents,
    );

    expect(interaction.mainTokens).toEqual({
      input: 10,
      output: 22,
      cacheRead: 5,
      cacheWrite: 3,
    });
  });

  it('puts every assistant\u2019s Model and output before the serving-Model rule', () => {
    const [interaction] = normaliseInteractions(
      accumulateInteractions(
        [
          prompt('one'),
          assistant('claude-haiku-4-5', { out: 12 }),
          assistant('claude-opus-4-8-20250101', { out: 10 }),
          assistant('claude-opus-4-8[1m]', { out: 8 }),
        ],
        dialect,
        context,
      ),
      dialect,
      context.filePath,
      noSubagents,
    );

    expect(interaction.model).toBe('claude-opus-4-8');
    expect(interaction.modelRaw).toBe('claude-opus-4-8-20250101');
  });

  it('names the Harness and the file when no Model responded', () => {
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

  it('takes sub-agent tokens and the disclosure flag from the Session\u2019s hook', () => {
    const [interaction] = normaliseInteractions(
      accumulateInteractions(
        [prompt('one'), assistant('claude-opus-4-8', { out: 1 })],
        dialect,
        context,
      ),
      dialect,
      context.filePath,
      () => ({
        subTokens: { input: 4, output: 5, cacheRead: null, cacheWrite: null },
        spawnedSubagents: true,
      }),
    );

    expect(interaction.subTokens).toEqual({
      input: 4,
      output: 5,
      cacheRead: null,
      cacheWrite: null,
    });
    expect(interaction.spawnedSubagents).toBe(true);
  });
});

describe('folding the timestamp envelope', () => {
  it('widens the seed to cover every record that carries a timestamp', () => {
    expect(
      foldTimestampEnvelope(
        [
          { timestamp: '2025-01-01T00:00:05.000Z' },
          { timestamp: 'not a timestamp' },
          { timestamp: 7 },
          { timestamp: '2025-01-01T00:00:01.000Z' },
        ],
        Date.parse('2025-01-01T00:00:00.000Z'),
      ),
    ).toEqual({
      startedAt: Date.parse('2025-01-01T00:00:00.000Z'),
      endedAt: Date.parse('2025-01-01T00:00:05.000Z'),
    });
  });

  it('derives the whole envelope from the records when there is no seed', () => {
    expect(
      foldTimestampEnvelope([{ timestamp: '2025-01-01T00:00:02.000Z' }], null),
    ).toEqual({
      startedAt: Date.parse('2025-01-01T00:00:02.000Z'),
      endedAt: Date.parse('2025-01-01T00:00:02.000Z'),
    });
  });

  it('reports an absent envelope when nothing is datable', () => {
    expect(foldTimestampEnvelope([{ timestamp: undefined }], null)).toEqual({
      startedAt: null,
      endedAt: null,
    });
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

  it('rewinds to the last genuine prompt in the scanned range', () => {
    expect(findPromptBoundary(contents, contents.length, dialect)).toBe(
      offsets[3],
    );
  });

  it('ignores a prompt that starts at or after the scan limit', () => {
    expect(findPromptBoundary(contents, offsets[3], dialect)).toBe(offsets[1]);
  });

  it('starts from the beginning when the range holds no prompt', () => {
    expect(findPromptBoundary(contents, offsets[1], dialect)).toBe(0);
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

  it('scopes a child reference to the node that spawned it', () => {
    const agents: Agent[] = [
      { key: 'a', assistants: [], children: ['worker'] },
      { key: 'a.worker', assistants: [{ id: 'a.worker' }], children: [] },
      { key: 'b.worker', assistants: [{ id: 'b.worker' }], children: [] },
    ];

    expect(
      foldSubagentTree(['a'], topologyOf(agents)).map((record) => record.id),
    ).toEqual(['a.worker']);
  });

  it('counts a node once however many references reach it', () => {
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

  it('terminates on a cycle rather than recurring forever', () => {
    const agents: Agent[] = [
      { key: 'a', assistants: [{ id: 'a' }], children: ['a'] },
    ];
    const cyclic: SubagentTopology<string, Agent, TestRecord> = {
      ...topologyOf(agents),
      resolve: (name) => agents.find((agent) => agent.key === name) ?? null,
    };

    expect(foldSubagentTree(['a'], cyclic).map((record) => record.id)).toEqual([
      'a',
    ]);
  });

  it('contributes nothing for a reference that names no node', () => {
    const agents: Agent[] = [
      { key: 'a', assistants: [{ id: 'a' }], children: ['missing'] },
    ];

    expect(
      foldSubagentTree(['a', 'absent'], topologyOf(agents)).map(
        (record) => record.id,
      ),
    ).toEqual(['a']);
  });
});
