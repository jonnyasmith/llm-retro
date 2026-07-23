import { bootstrap } from '$lib/server/bootstrap';
import { listJobRuns } from '$lib/server/database/store';
import type { PageServerLoad } from './$types';

const claudeIngestIdentity = { type: 'ingest', scope: 'claude' } as const;
const codexIngestIdentity = { type: 'ingest', scope: 'codex' } as const;
const piIngestIdentity = { type: 'ingest', scope: 'pi' } as const;

export const load: PageServerLoad = () => {
  const claudeRuns = listJobRuns(bootstrap.database, claudeIngestIdentity);
  const codexRuns = listJobRuns(bootstrap.database, codexIngestIdentity);
  const piRuns = listJobRuns(bootstrap.database, piIngestIdentity);
  const activeCorrelationId = (runs: typeof claudeRuns): string | null =>
    runs.find(({ status }) => status === 'pending' || status === 'running')
      ?.correlationId ?? null;

  return {
    claudeRuns,
    claudeActiveCorrelationId: activeCorrelationId(claudeRuns),
    codexRuns,
    codexActiveCorrelationId: activeCorrelationId(codexRuns),
    piRuns,
    piActiveCorrelationId: activeCorrelationId(piRuns),
  };
};
