import { harnesses } from '../jobs/contracts';
import type { Database } from './database/connection';
import { JobDispatcher, reconcileInterruptedJobRuns } from './jobs/dispatcher';
import { JobEventSource } from './jobs/events';
import { createIngestHandler } from './jobs/ingest-pipeline';
import { ingestAdapters, ingestJobIdentity } from './jobs/ingest-registry';
import { JobRunStream } from './jobs/job-run-stream';
import { stubJobHandler } from './jobs/stub-job';
import { InProcessJobBackend } from './jobs/types';

export function initialiseRuntime(database: Database) {
  reconcileInterruptedJobRuns(database);
  const jobEvents = new JobEventSource();
  const jobBackend = new InProcessJobBackend(database);
  jobBackend.registerScoped('stub', stubJobHandler);
  for (const harness of harnesses) {
    jobBackend.register(
      ingestJobIdentity(harness),
      createIngestHandler(ingestAdapters[harness]),
    );
  }
  const dispatcher = new JobDispatcher(database, jobEvents, {
    backend: jobBackend,
  });
  return { dispatcher, jobRunStream: new JobRunStream(database, jobEvents) };
}
