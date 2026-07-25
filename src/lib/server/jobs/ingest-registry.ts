import type { Harness } from '../../jobs/contracts';
import { claudeIngestAdapter } from './claude-adapter';
import { codexIngestAdapter } from './codex-adapter';
import { ompIngestAdapter } from './omp-adapter';
import { piIngestAdapter } from './pi-adapter';
import type { IngestAdapter } from './ingest-pipeline';
import type { JobIdentity } from './types';

export const ingestAdapters: Record<Harness, IngestAdapter<unknown>> = {
  claude: claudeIngestAdapter,
  codex: codexIngestAdapter,
  pi: piIngestAdapter,
  omp: ompIngestAdapter,
};

export function ingestJobIdentity(harness: Harness): JobIdentity {
  return { type: 'ingest', scope: harness };
}
