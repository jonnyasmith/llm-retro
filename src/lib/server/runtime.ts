import type { Database } from './database/connection';
import { createClaudeIngestHandler } from './jobs/claude-ingest';
import { createCodexIngestHandler } from './jobs/codex-ingest';
import { createPiIngestHandler } from './jobs/pi-ingest';
import { createOmpIngestHandler } from './jobs/omp-ingest';
import { JobDispatcher, reconcileInterruptedJobRuns } from './jobs/dispatcher';
import { JobEventSource } from './jobs/events';
import { stubJobHandler } from './jobs/stub-job';
import { InProcessJobBackend } from './jobs/types';

export function initialiseRuntime(database: Database) {
  reconcileInterruptedJobRuns(database);
  const jobEvents = new JobEventSource();
  const jobBackend = new InProcessJobBackend(database);
  jobBackend.registerScoped('stub', stubJobHandler);
  jobBackend.register(
    { type: 'ingest', scope: 'claude' },
    createClaudeIngestHandler(),
  );
  jobBackend.register(
    { type: 'ingest', scope: 'codex' },
    createCodexIngestHandler(),
  );
  jobBackend.register({ type: 'ingest', scope: 'pi' }, createPiIngestHandler());
  jobBackend.register(
    { type: 'ingest', scope: 'omp' },
    createOmpIngestHandler(),
  );
  const dispatcher = new JobDispatcher(database, jobEvents, {
    backend: jobBackend,
  });
  return { dispatcher, jobEvents };
}
