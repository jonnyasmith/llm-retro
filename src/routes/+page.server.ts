import { bootstrap } from '$lib/server/bootstrap';
import { listJobRuns } from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

const claudeIngestIdentity = { type: 'ingest', scope: 'claude' } as const;

export const load: PageServerLoad = () => {
  const runs = listJobRuns(bootstrap.database, claudeIngestIdentity);
  const activeRun = runs.find(
    ({ status }) => status === 'pending' || status === 'running',
  );

  return {
    runs,
    activeCorrelationId: activeRun?.correlationId ?? null,
  };
};
