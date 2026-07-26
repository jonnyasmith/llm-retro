import type {
  IngestSourceContents,
  InteractionUpdate,
  NormalisedSession,
} from './ingest-pipeline';
import {
  accumulateInteractions,
  findPromptBoundary,
  foldSubagentTree,
  foldTimestampEnvelope,
  normaliseInteractions,
  sumTokens,
  type InteractionDialect,
  type PendingInteraction,
  type SubagentDisclosure,
  type SubagentTopology,
} from './interaction-accumulator';
import { isRecord, parseTimestamp } from './jsonl-records';

interface ClaudeRecord {
  type?: unknown;
  uuid?: unknown;
  id?: unknown;
  cwd?: unknown;
  timestamp?: unknown;
  agentId?: unknown;
  isMeta?: unknown;
  isSidechain?: unknown;
  content?: unknown;
  toolUseResult?: unknown;
  message?: {
    content?: unknown;
    model?: unknown;
    usage?: Record<string, unknown>;
  };
}

/** One sub-agent's records, gathered from wherever Claude logged them. */
interface ClaudeAgent {
  agentId: string;
  records: ClaudeRecord[];
}

// The only Harness-shaped part of token extraction: which wire field is which
// bucket. The output key is named because the serving-Model rule needs it too.
const outputWireKey = 'output_tokens';

const claudeDialect: InteractionDialect<ClaudeRecord> = {
  harness: 'claude',
  isGenuinePrompt,
  isMainAssistant: (record) =>
    record.type === 'assistant' && record.isSidechain !== true,
  // Claude's prompts carry their own cwd and one that does not is corrupt, so
  // the accumulator's fallback is never reached.
  openInteraction(record, { filePath }) {
    const interactionKey =
      typeof record.uuid === 'string'
        ? record.uuid
        : typeof record.id === 'string'
          ? record.id
          : null;
    if (!interactionKey) {
      throw new Error(`Genuine Claude user record has no id: ${filePath}`);
    }
    if (typeof record.cwd !== 'string' || record.cwd.length === 0) {
      throw new Error(`Genuine Claude user record has no cwd: ${filePath}`);
    }
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp === null) {
      throw new Error(
        `Genuine Claude user record has an invalid timestamp: ${filePath}`,
      );
    }
    return {
      interactionKey,
      cwd: record.cwd,
      timestamp,
      assistants: [],
      records: [],
    };
  },
  tokenWireKeys: [
    ['input', 'input_tokens'],
    ['output', outputWireKey],
    ['cacheRead', 'cache_read_input_tokens'],
    ['cacheWrite', 'cache_creation_input_tokens'],
  ],
  outputWireKey,
  parseRecord: (line, filePath, lineNumber) =>
    parseRecords(line, filePath, lineNumber)[0],
};

export function readClaudeSession(
  filePath: string,
  primaryContents: string,
  subagentFiles: IngestSourceContents[] = [],
): NormalisedSession {
  const records = parseRecords(primaryContents, filePath);
  const agents = collectAgents(records, subagentFiles);
  const { startedAt, endedAt } = foldTimestampEnvelope(records, null);
  const pendingInteractions = accumulateInteractions(records, claudeDialect, {
    filePath,
    defaultCwd: '',
  });
  return {
    startedAt,
    endedAt,
    interactions: normaliseInteractions(
      pendingInteractions,
      claudeDialect,
      filePath,
      discloseClaudeSubagents(pendingInteractions, records, agents),
    ),
  };
}

/**
 * The sub-agent Token usage of Interactions the pipeline has already stored,
 * recomputed once the sidechain files that were still being written have caught
 * up.
 */
export function readClaudeSubTokenUpdates(
  filePath: string,
  primaryContents: string,
  subagentFiles: IngestSourceContents[] = [],
): InteractionUpdate[] {
  const records = parseRecords(primaryContents, filePath);
  const agents = collectAgents(records, subagentFiles);
  const pendingInteractions = accumulateInteractions(records, claudeDialect, {
    filePath,
    defaultCwd: '',
  });
  const disclose = discloseClaudeSubagents(
    pendingInteractions,
    records,
    agents,
  );
  return pendingInteractions.map((pending) => ({
    interactionKey: pending.interactionKey,
    subTokens: disclose(pending).subTokens,
  }));
}

export function findClaudePromptBoundary(
  contents: Buffer,
  beforeByteOffset: number,
): number {
  return findPromptBoundary(contents, beforeByteOffset, claudeDialect);
}

/**
 * Not the shared parser: this one carries a line that decodes to a scalar
 * through as a record, and throws a `SyntaxError` naming no cause. Converging
 * it changes behaviour rather than structure.
 */
function parseRecords(
  contents: string,
  filePath: string,
  firstLineNumber = 1,
): ClaudeRecord[] {
  return contents
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as ClaudeRecord;
      } catch (cause) {
        throw new SyntaxError(
          `Invalid Claude JSONL at ${filePath}:${firstLineNumber + index}`,
          { cause },
        );
      }
    });
}

/**
 * An Interaction owns the agents whose completion its own `Agent` tool call
 * received, and everything those agents spawned in turn.
 */
function discloseClaudeSubagents(
  pendingInteractions: readonly PendingInteraction<ClaudeRecord>[],
  sessionRecords: ClaudeRecord[],
  agents: Map<string, ClaudeAgent>,
): SubagentDisclosure<ClaudeRecord> {
  const agentsByInteraction = attributeCompletedAgents(
    pendingInteractions,
    sessionRecords,
  );
  const topology = claudeSubagentTopology(agents);
  return (pending) => ({
    subTokens: sumTokens(
      foldSubagentTree(agentsByInteraction.get(pending) ?? [], topology),
      claudeDialect,
    ),
    spawnedSubagents: false,
  });
}

function claudeSubagentTopology(
  agents: Map<string, ClaudeAgent>,
): SubagentTopology<string, ClaudeAgent, ClaudeRecord> {
  return {
    // An agent id is unique across the whole Session, so the spawning agent
    // never narrows the search.
    resolve: (agentId) => agents.get(agentId) ?? null,
    keyOf: (agent) => agent.agentId,
    assistantsOf: (agent) =>
      agent.records.filter(
        (record) => record.type === 'assistant' && record.isSidechain === true,
      ),
    childrenOf: (agent) => completedSpawnedAgentIds(agent.records),
  };
}

function collectAgents(
  sessionRecords: ClaudeRecord[],
  subagentFiles: IngestSourceContents[],
): Map<string, ClaudeAgent> {
  const agents = groupAgentRecords(sessionRecords);
  for (const { filePath, contents } of subagentFiles) {
    for (const [agentId, agent] of groupAgentRecords(
      parseRecords(contents, filePath),
    )) {
      const existing = agents.get(agentId);
      if (existing === undefined) {
        agents.set(agentId, agent);
        continue;
      }
      for (const record of agent.records) existing.records.push(record);
    }
  }
  return agents;
}

function groupAgentRecords(records: ClaudeRecord[]): Map<string, ClaudeAgent> {
  const agents = new Map<string, ClaudeAgent>();
  for (const record of records) {
    if (record.isSidechain !== true || typeof record.agentId !== 'string') {
      continue;
    }
    const agent = agents.get(record.agentId) ?? {
      agentId: record.agentId,
      records: [],
    };
    agent.records.push(record);
    agents.set(record.agentId, agent);
  }
  return agents;
}

function isGenuinePrompt(record: ClaudeRecord): boolean {
  if (
    record.type !== 'user' ||
    record.isSidechain === true ||
    record.isMeta === true
  ) {
    return false;
  }
  const content = record.message?.content ?? record.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  if (
    content.some((block) => isRecord(block) && block.type === 'tool_result')
  ) {
    return false;
  }
  return content.some(
    (block) =>
      isRecord(block) &&
      block.type === 'text' &&
      typeof block.text === 'string',
  );
}

function attributeCompletedAgents(
  pendingInteractions: readonly PendingInteraction<ClaudeRecord>[],
  sessionRecords: ClaudeRecord[],
): Map<PendingInteraction<ClaudeRecord>, string[]> {
  const spawningInteractionByToolUseId = new Map<
    string,
    PendingInteraction<ClaudeRecord>
  >();
  for (const interaction of pendingInteractions) {
    for (const toolUseId of agentToolUseIds(interaction.records, false)) {
      spawningInteractionByToolUseId.set(toolUseId, interaction);
    }
  }

  const agentsByInteraction = new Map<
    PendingInteraction<ClaudeRecord>,
    string[]
  >();
  for (const completion of completedAgentResults(sessionRecords, false)) {
    const interaction = spawningInteractionByToolUseId.get(
      completion.toolUseId,
    );
    if (!interaction) continue;
    const agentIds = agentsByInteraction.get(interaction) ?? [];
    agentIds.push(completion.agentId);
    agentsByInteraction.set(interaction, agentIds);
  }
  return agentsByInteraction;
}

function completedSpawnedAgentIds(records: ClaudeRecord[]): string[] {
  const toolUseIds = agentToolUseIds(records, true);
  return completedAgentResults(records, true)
    .filter((completion) => toolUseIds.has(completion.toolUseId))
    .map((completion) => completion.agentId);
}

function agentToolUseIds(
  records: ClaudeRecord[],
  sidechain: boolean,
): Set<string> {
  const toolUseIds = new Set<string>();
  for (const record of records) {
    if ((record.isSidechain === true) !== sidechain) continue;
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        isRecord(block) &&
        block.type === 'tool_use' &&
        block.name === 'Agent' &&
        typeof block.id === 'string'
      ) {
        toolUseIds.add(block.id);
      }
    }
  }
  return toolUseIds;
}

function completedAgentResults(
  records: ClaudeRecord[],
  sidechain: boolean,
): Array<{ toolUseId: string; agentId: string }> {
  const completions: Array<{ toolUseId: string; agentId: string }> = [];
  for (const record of records) {
    if ((record.isSidechain === true) !== sidechain) continue;
    if (!isRecord(record.toolUseResult)) continue;
    const result = record.toolUseResult;
    if (result.status !== 'completed' || typeof result.agentId !== 'string') {
      continue;
    }
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        isRecord(block) &&
        block.type === 'tool_result' &&
        typeof block.tool_use_id === 'string'
      ) {
        completions.push({
          toolUseId: block.tool_use_id,
          agentId: result.agentId,
        });
      }
    }
  }
  return completions;
}
