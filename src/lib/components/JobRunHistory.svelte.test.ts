import type { JobRunSummary } from '$lib/jobs/contracts';
import { textsOf } from '$lib/render-fixture';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import JobRunHistory from './JobRunHistory.svelte';

// Milliseconds and a multi-minute span are load-bearing: a round-second run
// under a minute long passes against both defects this component shipped.
const startedAt = Date.UTC(2026, 2, 14, 9, 41, 7, 483);
const finishedAt = Date.UTC(2026, 2, 14, 9, 44, 30, 12);

function run(overrides: Partial<JobRunSummary> = {}): JobRunSummary {
  return {
    correlationId: 'run-1',
    status: 'succeeded',
    startedAt,
    finishedAt,
    error: null,
    filesTotal: 12,
    filesDone: 12,
    ...overrides,
  };
}

describe('JobRunHistory.svelte', () => {
  it('lists every column in order', async () => {
    await render(JobRunHistory, { harness: 'claude', runs: [run()] });

    expect(textsOf(page.getByRole('row').first().getByRole('cell'))).toEqual([
      'Status',
      'Started',
      'Duration',
      'Files',
      'Run details',
    ]);
  });

  it('lays a finished run out across the columns it belongs in', async () => {
    await render(JobRunHistory, { harness: 'claude', runs: [run()] });

    expect(textsOf(page.getByRole('row').last().getByRole('cell'))).toEqual([
      'succeeded',
      '2026-03-14 09:41:07 UTC',
      '3m 23s',
      '12 / 12',
      'View',
    ]);
  });

  it('offers an unfinished run a Watch link and no duration', async () => {
    await render(JobRunHistory, {
      harness: 'claude',
      runs: [run({ status: 'running', finishedAt: null, filesDone: 5 })],
    });

    expect(textsOf(page.getByRole('row').last().getByRole('cell'))).toEqual([
      'running',
      '2026-03-14 09:41:07 UTC',
      'In progress',
      '5 / 12',
      'Watch',
    ]);
  });

  it('publishes the started instant to assistive technology', async () => {
    await render(JobRunHistory, { harness: 'claude', runs: [run()] });

    expect(page.getByText('2026-03-14 09:41:07 UTC').element()).toHaveAttribute(
      'datetime',
      '2026-03-14T09:41:07.483Z',
    );
  });

  it('leaves the machine-readable instant off a run that never started', async () => {
    await render(JobRunHistory, {
      harness: 'claude',
      runs: [run({ status: 'pending', startedAt: null, finishedAt: null })],
    });

    expect(page.getByText('Not started').element()).not.toHaveAttribute(
      'datetime',
    );
  });

  it('says so in a full-width row when the Harness has no runs', async () => {
    await render(JobRunHistory, { harness: 'claude', runs: [] });

    const empty = page
      .getByRole('cell', { name: 'No Claude ingestion runs yet.' })
      .element() as HTMLTableCellElement;
    expect(empty.colSpan).toBe(5);
  });
});
