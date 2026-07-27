<script lang="ts">
  import { invalidateAll, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { triggerIngest } from '$lib/jobs/client';
  import {
    harnessLabels,
    type JobRunSummary,
    type Harness,
  } from '$lib/jobs/contracts';
  import { IngestJob, requestedRunId } from '$lib/jobs/ingest-job.svelte';
  import { openJobRunEventSource } from '$lib/jobs/job-run-event-source';
  import { onDestroy, untrack } from 'svelte';

  let {
    harness,
    runs,
    activeCorrelationId,
  }: {
    harness: Harness;
    runs: JobRunSummary[];
    activeCorrelationId: string | null;
  } = $props();
  const harnessLabel = $derived(harnessLabels[harness]);
  // The section this instance renders never changes Harness — the Jobs screen
  // loops one over each — so its wording is read once at construction rather
  // than tracked.
  const job = new IngestJob(
    () => triggerIngest(harness),
    openJobRunEventSource,
    untrack(() => `Unable to start ${harnessLabel} ingestion`),
  );

  async function trigger() {
    const correlationId = await job.trigger();
    if (correlationId === null) return;
    replaceState(
      resolve(
        `/?harness=${encodeURIComponent(harness)}&run=${encodeURIComponent(correlationId)}`,
      ),
      {},
    );
  }

  $effect(() => {
    const requested =
      requestedRunId(page.url.searchParams, harness, runs) ??
      activeCorrelationId;
    if (requested) job.follow(requested);
  });

  $effect(() => {
    if (job.run?.finished) void invalidateAll();
  });

  onDestroy(() => job.close());
</script>

<section aria-labelledby={`${harness}-ingest-heading`}>
  <div class="section-heading">
    <div>
      <p class="eyebrow">{harnessLabel}</p>
      <h2 id={`${harness}-ingest-heading`}>Ingest session history</h2>
    </div>
    <button onclick={trigger} disabled={job.triggering || job.running}>
      {job.triggering
        ? 'Starting…'
        : job.running
          ? 'Ingestion running…'
          : `Ingest ${harnessLabel}`}
    </button>
  </div>

  {#if job.error}
    <p class="error" role="alert">{job.error}</p>
  {/if}

  {#if job.joined}
    <p class="notice" role="status">
      A {harnessLabel} ingest was already in progress — showing you that run.
    </p>
  {/if}

  {#if job.run}
    {@const run = job.run}
    <dl class="run-details">
      <div>
        <dt>Run handle</dt>
        <dd>{run.correlationId}</dd>
      </div>
      <div>
        <dt>Stream</dt>
        <dd>{job.streamLabel}</dd>
      </div>
    </dl>

    <div class="progress-copy">
      <strong>{job.percentage}%</strong>
      <span>{run.filesDone} of {run.filesTotal} files</span>
    </div>
    <progress
      aria-label={`${harnessLabel} ingest file progress`}
      value={run.filesDone}
      max={run.filesTotal || 1}>{job.percentage}%</progress
    >
    <p class="current-file">
      <span>{run.finished ? 'Last file' : 'Current file'}</span>
      {run.currentFile ??
        (run.finished
          ? 'No file processed'
          : `Discovering ${harnessLabel} sessions…`)}
    </p>

    <div class="terminal" aria-live="polite">
      {#if run.finished}
        <strong
          class:success={run.status === 'succeeded'}
          class:interrupted={run.status === 'interrupted'}
        >
          {run.status}
        </strong>
        {#if run.error}<span>{run.error}</span>{/if}
      {:else}
        <span>{harnessLabel} ingestion in progress</span>
      {/if}
    </div>

    <div class="log-heading">
      <h3>Live log</h3>
      <span>{run.log.length} messages</span>
    </div>
    <ol class="log" aria-live="polite">
      {#each run.log as message, index (`${index}:${message}`)}
        <li>{message}</li>
      {:else}
        <li class="empty">Waiting for messages…</li>
      {/each}
    </ol>
  {:else}
    <p class="empty-state">
      Start ingestion to discover {harnessLabel} session files from your configured
      sources. Re-running is safe and resumes from saved checkpoints.
    </p>
  {/if}
</section>

<style>
  section {
    padding: clamp(1.25rem, 4vw, 2.25rem);
    border: 1px solid #d8d0c0;
    border-radius: 1rem;
    background: #fffdf8;
    box-shadow: 0 1rem 3rem rgb(53 61 56 / 8%);
  }

  .section-heading,
  .progress-copy,
  .log-heading {
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

  button {
    padding: 0.75rem 1rem;
    border: 0;
    border-radius: 999px;
    color: #fff;
    background: #315b3d;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  button:focus-visible {
    outline: 3px solid #c18a3b;
    outline-offset: 3px;
  }

  .run-details {
    display: grid;
    grid-template-columns: 3fr 1fr;
    gap: 1rem;
    margin: 2rem 0;
  }

  .run-details div {
    min-width: 0;
  }

  dt,
  .current-file span {
    color: #6d756f;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  dd {
    overflow: hidden;
    margin: 0.25rem 0 0;
    font-family: ui-monospace, monospace;
    text-overflow: ellipsis;
  }

  .progress-copy strong {
    font-family: ui-serif, Georgia, serif;
    font-size: 2.5rem;
    font-weight: 500;
  }

  progress {
    width: 100%;
    height: 0.8rem;
    accent-color: #50755b;
  }

  .current-file {
    display: grid;
    gap: 0.3rem;
    overflow-wrap: anywhere;
  }

  .terminal {
    display: flex;
    gap: 0.5rem;
    min-height: 1.5rem;
    margin: 1.5rem 0;
  }

  .terminal strong {
    color: #9b3b32;
    font-weight: 700;
    text-transform: capitalize;
  }

  .terminal strong.success {
    color: #317142;
  }

  .terminal strong.interrupted {
    color: #8a5b16;
  }

  .log-heading {
    margin-top: 2rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .log-heading span,
  .empty-state,
  .empty {
    color: #6d756f;
  }

  .log {
    max-height: 16rem;
    overflow: auto;
    margin: 0.75rem 0 0;
    padding: 1rem 1rem 1rem 2.75rem;
    border-radius: 0.6rem;
    color: #dce7df;
    background: #17201b;
    font-family: ui-monospace, monospace;
    font-size: 0.82rem;
  }

  .log li + li {
    margin-top: 0.4rem;
  }

  .error {
    color: #9b3b32;
  }

  .notice {
    color: #8a5b16;
  }

  @media (max-width: 36rem) {
    .section-heading,
    .run-details {
      align-items: stretch;
      grid-template-columns: 1fr;
    }

    .section-heading {
      flex-direction: column;
    }

    button {
      width: 100%;
    }
  }
</style>
