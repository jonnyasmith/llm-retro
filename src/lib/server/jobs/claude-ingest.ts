import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/connection';
import { interactions, projects, sessions } from '../database/schema';
import { getSettings } from '../database/store';
import { deriveLocalBuckets } from '../database/time-buckets';
import type { Job, JobHandler } from './types';

export interface ResolvedProject {
  rootPath: string;
  gitRemoteUrl: string | null;
}

export type CwdProjectResolver = (cwd: string) => Promise<ResolvedProject>;

interface ClaudeRecord {
  type?: unknown;
  uuid?: unknown;
  id?: unknown;
  cwd?: unknown;
  timestamp?: unknown;
  isMeta?: unknown;
  isSidechain?: unknown;
  content?: unknown;
  message?: {
    content?: unknown;
    model?: unknown;
    usage?: Record<string, unknown>;
  };
}

interface PendingInteraction {
  openingUserRecordId: string;
  cwd: string;
  timestamp: number;
  assistants: ClaudeRecord[];
}

interface NormalisedInteraction {
  openingUserRecordId: string;
  cwd: string;
  model: string;
  modelRaw: string;
  mainInputTokens: number | null;
  mainOutputTokens: number | null;
  mainCacheReadTokens: number | null;
  mainCacheWriteTokens: number | null;
  timestamp: number;
}

type MainTokenColumn = keyof Pick<
  NormalisedInteraction,
  | 'mainInputTokens'
  | 'mainOutputTokens'
  | 'mainCacheReadTokens'
  | 'mainCacheWriteTokens'
>;

interface ParsedSession {
  cwd: string;
  startedAt: number | null;
  endedAt: number | null;
  interactions: NormalisedInteraction[];
}

const tokenColumns = [
  ['input_tokens', 'mainInputTokens'],
  ['output_tokens', 'mainOutputTokens'],
  ['cache_read_input_tokens', 'mainCacheReadTokens'],
  ['cache_creation_input_tokens', 'mainCacheWriteTokens'],
] as const satisfies ReadonlyArray<readonly [string, MainTokenColumn]>;

export async function literalCwdProjectResolver(
  cwd: string,
): Promise<ResolvedProject> {
  return { rootPath: cwd, gitRemoteUrl: null };
}

export function createClaudeIngestJob(): Job<null> {
  return {
    identity: { type: 'ingest', scope: 'claude' },
    payload: null,
  };
}

export function createClaudeIngestHandler(
  options: { resolveProject?: CwdProjectResolver } = {},
): JobHandler<null> {
  const resolveProject = options.resolveProject ?? literalCwdProjectResolver;

  return {
    async run(_payload, context) {
      const settings = getSettings(context.database);
      const filePaths = await discoverSessionFiles(settings.logSources.claude);
      const resolvedProjects = new Map<string, ResolvedProject>();
      context.progress({ filesTotal: filePaths.length, filesDone: 0 });

      for (const [index, filePath] of filePaths.entries()) {
        context.progress({
          filesTotal: filePaths.length,
          filesDone: index,
          currentFile: filePath,
        });
        const parsed = parseSession(await readFile(filePath, 'utf8'), filePath);
        const cwds = new Set([
          parsed.cwd,
          ...parsed.interactions.map((interaction) => interaction.cwd),
        ]);
        for (const cwd of cwds) {
          if (!resolvedProjects.has(cwd)) {
            resolvedProjects.set(cwd, await resolveProject(cwd));
          }
        }

        storeSession(
          context.database,
          basename(filePath, '.jsonl'),
          filePath,
          parsed,
          resolvedProjects,
          settings.timezone,
        );
        context.progress({
          filesTotal: filePaths.length,
          filesDone: index + 1,
        });
      }
    },
  };
}

async function discoverSessionFiles(logSources: string[]): Promise<string[]> {
  const paths: string[] = [];

  for (const logSource of logSources) {
    let projectDirectories;
    try {
      projectDirectories = await readdir(logSource, { withFileTypes: true });
    } catch (cause) {
      if (isMissingPath(cause)) continue;
      throw cause;
    }

    for (const projectDirectory of projectDirectories) {
      if (!projectDirectory.isDirectory()) continue;
      const directoryPath = join(logSource, projectDirectory.name);
      const entries = await readdir(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          paths.push(join(directoryPath, entry.name));
        }
      }
    }
  }

  return paths.sort();
}

function isMissingPath(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === 'ENOENT'
  );
}

function parseSession(contents: string, filePath: string): ParsedSession {
  const records = contents
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as ClaudeRecord;
      } catch (cause) {
        throw new SyntaxError(
          `Invalid Claude JSONL at ${filePath}:${index + 1}`,
          { cause },
        );
      }
    });
  let startedAt: number | null = null;
  let endedAt: number | null = null;
  for (const record of records) {
    const timestamp = parseTimestamp(record.timestamp);
    if (timestamp === null) continue;
    startedAt = startedAt === null ? timestamp : Math.min(startedAt, timestamp);
    endedAt = endedAt === null ? timestamp : Math.max(endedAt, timestamp);
  }
  const cwd = records.find(
    (record): record is ClaudeRecord & { cwd: string } =>
      typeof record.cwd === 'string' && record.cwd.length > 0,
  )?.cwd;
  if (!cwd) throw new Error(`Claude Session has no recorded cwd: ${filePath}`);

  const normalised: NormalisedInteraction[] = [];
  let pending: PendingInteraction | null = null;
  for (const record of records) {
    if (isGenuineUserPrompt(record)) {
      if (pending && pending.assistants.length > 0) {
        normalised.push(normaliseInteraction(pending, filePath));
      }
      pending = openInteraction(record, filePath);
      continue;
    }
    if (pending && record.type === 'assistant' && record.isSidechain !== true) {
      pending.assistants.push(record);
    }
  }
  if (pending && pending.assistants.length > 0) {
    normalised.push(normaliseInteraction(pending, filePath));
  }

  return {
    cwd,
    startedAt,
    endedAt,
    interactions: normalised,
  };
}

function isGenuineUserPrompt(record: ClaudeRecord): boolean {
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
  if (content.some(isToolResultBlock)) return false;
  return content.some(isTextBlock);
}

function isToolResultBlock(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'tool_result'
  );
}

function isTextBlock(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'text' &&
    'text' in value &&
    typeof value.text === 'string'
  );
}

function openInteraction(
  record: ClaudeRecord,
  filePath: string,
): PendingInteraction {
  const openingUserRecordId =
    typeof record.uuid === 'string'
      ? record.uuid
      : typeof record.id === 'string'
        ? record.id
        : null;
  if (!openingUserRecordId) {
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
    openingUserRecordId,
    cwd: record.cwd,
    timestamp,
    assistants: [],
  };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normaliseInteraction(
  pending: PendingInteraction,
  filePath: string,
): NormalisedInteraction {
  const modelRaw = selectModel(pending.assistants, filePath);
  const tokens: Pick<
    NormalisedInteraction,
    | 'mainInputTokens'
    | 'mainOutputTokens'
    | 'mainCacheReadTokens'
    | 'mainCacheWriteTokens'
  > = {
    mainInputTokens: null,
    mainOutputTokens: null,
    mainCacheReadTokens: null,
    mainCacheWriteTokens: null,
  };
  for (const [sourceKey, targetKey] of tokenColumns) {
    const values = pending.assistants
      .map((record) => record.message?.usage?.[sourceKey])
      .filter((value): value is number => typeof value === 'number');
    tokens[targetKey] =
      values.length === 0
        ? null
        : values.reduce((total, value) => total + value, 0);
  }

  return {
    openingUserRecordId: pending.openingUserRecordId,
    cwd: pending.cwd,
    model: canonicaliseModel(modelRaw),
    modelRaw,
    ...tokens,
    timestamp: pending.timestamp,
  };
}

function selectModel(assistants: ClaudeRecord[], filePath: string): string {
  const outputByModel = new Map<string, number>();
  for (const assistant of assistants) {
    const model = assistant.message?.model;
    if (typeof model !== 'string' || model.length === 0) continue;
    const outputTokens = assistant.message?.usage?.output_tokens;
    outputByModel.set(
      model,
      (outputByModel.get(model) ?? 0) +
        (typeof outputTokens === 'number' ? outputTokens : 0),
    );
  }
  const firstModel = outputByModel.keys().next().value;
  if (!firstModel) {
    throw new Error(`Responded Claude Interaction has no model: ${filePath}`);
  }
  if (outputByModel.size === 1) return firstModel;

  let selected = firstModel;
  for (const [model, outputTokens] of outputByModel) {
    if (outputTokens > (outputByModel.get(selected) ?? 0)) selected = model;
  }
  return selected;
}

function canonicaliseModel(model: string): string {
  return model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
}

function storeSession(
  database: Database,
  stableSessionId: string,
  logFilePath: string,
  parsed: ParsedSession,
  resolvedProjects: Map<string, ResolvedProject>,
  timezone: string,
): void {
  database.transaction((transaction) => {
    const projectIds = new Map<string, number>();
    for (const cwd of new Set([
      parsed.cwd,
      ...parsed.interactions.map((interaction) => interaction.cwd),
    ])) {
      const resolved = resolvedProjects.get(cwd);
      if (!resolved)
        throw new Error(`Project was not resolved for cwd: ${cwd}`);
      transaction
        .insert(projects)
        .values(resolved)
        .onConflictDoNothing({ target: projects.rootPath })
        .run();
      const project = transaction
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.rootPath, resolved.rootPath))
        .get();
      if (!project)
        throw new Error(`Project was not stored: ${resolved.rootPath}`);
      projectIds.set(cwd, project.id);
    }

    const sessionProjectId = projectIds.get(parsed.cwd);
    if (sessionProjectId === undefined) {
      throw new Error(`Session Project was not stored: ${parsed.cwd}`);
    }
    transaction
      .insert(sessions)
      .values({
        harness: 'claude',
        stableSessionId,
        projectId: sessionProjectId,
        logFilePath,
        startedAt: parsed.startedAt,
        endedAt: parsed.endedAt,
      })
      .onConflictDoUpdate({
        target: [sessions.harness, sessions.stableSessionId],
        set: {
          projectId: sessionProjectId,
          logFilePath,
          startedAt: parsed.startedAt,
          endedAt: parsed.endedAt,
        },
      })
      .run();
    const session = transaction
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.harness, 'claude'),
          eq(sessions.stableSessionId, stableSessionId),
        ),
      )
      .get();
    if (!session)
      throw new Error(`Claude Session was not stored: ${stableSessionId}`);

    for (const interaction of parsed.interactions) {
      const projectId = projectIds.get(interaction.cwd);
      if (projectId === undefined) {
        throw new Error(
          `Interaction Project was not stored: ${interaction.cwd}`,
        );
      }
      const derived = {
        projectId,
        model: interaction.model,
        modelRaw: interaction.modelRaw,
        mainInputTokens: interaction.mainInputTokens,
        mainOutputTokens: interaction.mainOutputTokens,
        mainCacheReadTokens: interaction.mainCacheReadTokens,
        mainCacheWriteTokens: interaction.mainCacheWriteTokens,
        timestamp: interaction.timestamp,
        ...deriveLocalBuckets(interaction.timestamp, timezone),
      };
      transaction
        .insert(interactions)
        .values({
          sessionId: session.id,
          openingUserRecordId: interaction.openingUserRecordId,
          harness: 'claude',
          ...derived,
        })
        .onConflictDoUpdate({
          target: [interactions.sessionId, interactions.openingUserRecordId],
          set: derived,
        })
        .run();
    }
  });
}
