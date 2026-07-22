import type { Database } from './database/connection';
import { JobDispatcher, reconcileInterruptedJobRuns } from './jobs/dispatcher';
import { JobEventSource } from './jobs/events';
import { stubJobHandler } from './jobs/stub-job';
import { InProcessJobBackend } from './jobs/types';

export function initialiseRuntime(database: Database) {
  reconcileInterruptedJobRuns(database);
  const jobEvents = new JobEventSource();
  const jobBackend = new InProcessJobBackend(database);
  jobBackend.register('stub', stubJobHandler);
  const dispatcher = new JobDispatcher(database, jobEvents, {
    backend: jobBackend,
  });
  return { dispatcher, jobEvents };
}
