<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    harnessLabels,
    isTerminalJobRunStatus,
    type JobRunSummary,
    type Harness,
  } from '$lib/jobs/contracts';

  let {
    harness,
    runs,
  }: {
    harness: Harness;
    runs: JobRunSummary[];
  } = $props();
  const harnessLabel = $derived(harnessLabels[harness]);

  function formatTimestamp(timestamp: number | null): string {
    if (timestamp === null) return 'Not started';
    return new Date(timestamp)
      .toISOString()
      .replace('T', ' ')
      .replace('.000Z', ' UTC');
  }

  function formatDuration(startedAt: number | null, finishedAt: number | null) {
    if (startedAt === null) return 'Waiting';
    if (finishedAt === null) return 'In progress';
    const milliseconds = finishedAt - startedAt;
    return milliseconds < 1_000
      ? `${milliseconds} ms`
      : `${(milliseconds / 1_000).toFixed(1)} s`;
  }
</script>

<section aria-labelledby={`${harness}-history-heading`}>
  <div class="section-heading">
    <div>
      <p class="eyebrow">Past runs</p>
      <h2 id={`${harness}-history-heading`}>{harnessLabel} history</h2>
    </div>
    <span class="run-count">{runs.length} runs</span>
  </div>

  <div class="history-table">
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Started</th>
          <th>Duration</th>
          <th>Files</th>
          <th><span class="visually-hidden">Run details</span></th>
        </tr>
      </thead>
      <tbody>
        {#each runs as run (run.correlationId)}
          <tr>
            <td>
              <span class="status" data-status={run.status}>{run.status}</span>
            </td>
            <td>
              <time
                datetime={run.startedAt === null
                  ? undefined
                  : new Date(run.startedAt).toISOString()}
                >{formatTimestamp(run.startedAt)}</time
              >
            </td>
            <td>{formatDuration(run.startedAt, run.finishedAt)}</td>
            <td>{run.filesDone} / {run.filesTotal}</td>
            <td>
              <a
                href={resolve(
                  `/?harness=${encodeURIComponent(harness)}&run=${encodeURIComponent(run.correlationId)}`,
                )}>{isTerminalJobRunStatus(run.status) ? 'View' : 'Watch'}</a
              >
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="empty"
              >No {harnessLabel} ingestion runs yet.</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  section {
    margin-top: 1.5rem;
    padding: clamp(1.25rem, 4vw, 2.25rem);
    border: 1px solid #d8d0c0;
    border-radius: 1rem;
    background: #fffdf8;
    box-shadow: 0 1rem 3rem rgb(53 61 56 / 8%);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .eyebrow {
    margin: 0;
    color: #50755b;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.25rem 0 0;
    font-family: ui-serif, Georgia, serif;
    font-size: 2rem;
    font-weight: 500;
  }

  .run-count,
  .empty {
    color: #6d756f;
  }

  .history-table {
    overflow-x: auto;
    margin-top: 1.5rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.8rem 0.5rem;
    border-bottom: 1px solid #e6dfd2;
    text-align: left;
    white-space: nowrap;
  }

  th {
    color: #6d756f;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  th:first-child,
  td:first-child {
    padding-left: 0;
  }

  th:last-child,
  td:last-child {
    padding-right: 0;
    text-align: right;
  }

  .status {
    font-weight: 700;
    text-transform: capitalize;
  }

  .status[data-status='failed'] {
    color: #9b3b32;
  }

  .status[data-status='succeeded'] {
    color: #317142;
  }

  .status[data-status='interrupted'] {
    color: #8a5b16;
  }

  .status[data-status='pending'],
  .status[data-status='running'] {
    color: #315b71;
  }

  a {
    display: inline-block;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    color: #315b3d;
    background: #e7eee8;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
  }

  a:focus-visible {
    outline: 3px solid #c18a3b;
    outline-offset: 3px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }

  @media (max-width: 36rem) {
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
