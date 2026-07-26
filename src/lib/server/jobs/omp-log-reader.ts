import { basename, dirname, relative } from 'node:path';
import type {
  IngestSourceContents,
  InteractionUpdate,
} from './ingest-pipeline';
import {
  accumulateInteractions,
  foldSubagentTree,
  sumTokens,
  type SubagentDisclosure,
  type SubagentTopology,
} from './interaction-accumulator';
import { isRecord } from './jsonl-records';
import {
  createPiGrammar,
  type PiRecord,
  type PiSessionMetadata,
} from './pi-log-reader';

export type { PiSessionMetadata as OmpSessionMetadata };

/** One nested agent log, keyed by its path beneath the Session's directory. */
interface AgentLog {
  key: string;
  parentKey: string | null;
  name: string;
  records: PiRecord[];
}

export const ompGrammar = createPiGrammar({
  harness: 'omp',
  sessionRecordIsFirst: false,
  discloseSubagents: discloseOmpSubagents,
});

/**
 * Recomputed sub-agent Token usage for Interactions already stored: an agent
 * log can still be growing when its spawning Interaction is first read.
 */
export function readOmpSubTokenUpdates(
  filePath: string,
  primaryContents: string,
  auxiliaryFiles: IngestSourceContents[],
  metadata: PiSessionMetadata,
): InteractionUpdate[] {
  const records = ompGrammar.parseRecords(primaryContents, filePath);
  const disclose = discloseOmpSubagents(records, auxiliaryFiles, filePath);
  return accumulateInteractions(records, ompGrammar.dialect, {
    filePath,
    defaultCwd: metadata.cwd,
  }).map((pending) => ({
    interactionKey: pending.interactionKey,
    subTokens: disclose(pending).subTokens,
  }));
}

/**
 * An Interaction owns the agents it spawned that reported back, and everything
 * those agents spawned in turn.
 */
function discloseOmpSubagents(
  records: PiRecord[],
  auxiliaryFiles: IngestSourceContents[],
  filePath: string,
): SubagentDisclosure<PiRecord> {
  const topology = ompSubagentTopology(
    parseAgentLogs(filePath, auxiliaryFiles),
  );
  return (pending) => ({
    subTokens: sumTokens(
      foldSubagentTree(
        completedSpawnedAgentNames(pending.records, records),
        topology,
      ),
      ompGrammar.dialect,
    ),
    spawnedSubagents: false,
  });
}

function ompSubagentTopology(
  agentLogs: AgentLog[],
): SubagentTopology<string, AgentLog, PiRecord> {
  return {
    // A `task` names its children relative to itself, so a name is only unique
    // within the directory of the agent that spawned it.
    resolve: (name, parent) =>
      agentLogs.find(
        (candidate) =>
          candidate.parentKey === (parent === null ? null : parent.key) &&
          (candidate.name === name || candidate.name.endsWith(`.${name}`)),
      ) ?? null,
    keyOf: (log) => log.key,
    assistantsOf: (log) =>
      log.records.filter((record) =>
        ompGrammar.dialect.isMainAssistant(record),
      ),
    childrenOf: (log) => completedSpawnedAgentNames(log.records, log.records),
  };
}

function parseAgentLogs(
  primaryFilePath: string,
  files: IngestSourceContents[],
): AgentLog[] {
  const sessionDirectory = primaryFilePath.slice(0, -'.jsonl'.length);
  return files.map(({ filePath, contents }) => {
    const relativePath = relative(sessionDirectory, filePath);
    const key = relativePath.slice(0, -'.jsonl'.length);
    const parentDirectory = dirname(key);
    const parentKey = parentDirectory === '.' ? null : parentDirectory;
    const stem = basename(key);
    const parentName = parentKey === null ? null : basename(parentKey);
    const name =
      parentName !== null && stem.startsWith(`${parentName}.`)
        ? stem.slice(parentName.length + 1)
        : stem;
    return {
      key,
      parentKey,
      name,
      records: ompGrammar.parseRecords(contents, filePath),
    };
  });
}

/**
 * The sub-agents these records spawned that the Session saw report back. An
 * agent still running when the slice ends has nothing to account for yet.
 */
function completedSpawnedAgentNames(
  spawningRecords: PiRecord[],
  completionRecords: PiRecord[],
): string[] {
  const completedIds = completedAgentIds(completionRecords);
  return spawnedAgentNames(spawningRecords).filter((name) =>
    completedIds.some((id) => id === name || id.endsWith(`.${name}`)),
  );
}

function spawnedAgentNames(records: PiRecord[]): string[] {
  const names: string[] = [];
  for (const record of records) {
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        !isRecord(block) ||
        block.type !== 'toolCall' ||
        block.name !== 'task'
      ) {
        continue;
      }
      if (!isRecord(block.arguments) || !Array.isArray(block.arguments.tasks)) {
        continue;
      }
      for (const task of block.arguments.tasks) {
        if (isRecord(task) && typeof task.name === 'string') {
          names.push(task.name);
        }
      }
    }
  }
  return names;
}

function completedAgentIds(records: PiRecord[]): string[] {
  const ids: string[] = [];
  for (const record of records) {
    if (record.message?.role !== 'toolResult') continue;
    const content = record.message.content;
    const texts =
      typeof content === 'string'
        ? [content]
        : Array.isArray(content)
          ? content.flatMap((block) =>
              isRecord(block) && typeof block.text === 'string'
                ? [block.text]
                : [],
            )
          : [];
    for (const text of texts) {
      for (const match of text.matchAll(/<task-result\b([^>]*)>/g)) {
        const attributes = match[1];
        const id = /\bid="([^"]+)"/.exec(attributes)?.[1];
        const status = /\bstatus="([^"]+)"/.exec(attributes)?.[1];
        if (id && status === 'completed') ids.push(id);
      }
    }
  }
  return ids;
}
