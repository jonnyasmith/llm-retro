import { mapHarnesses } from '$lib/jobs/contracts';
import { bootstrap } from '$lib/server/bootstrap';
import { listJobRuns } from '$lib/server/database/store';
import { ingestJobIdentity } from '$lib/server/jobs/ingest-registry';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
  ingestJobs: mapHarnesses((harness) => {
    const runs = listJobRuns(bootstrap.database, ingestJobIdentity(harness));
    return {
      runs,
      activeCorrelationId:
        runs.find(({ status }) => status === 'pending' || status === 'running')
          ?.correlationId ?? null,
    };
  }),
});
