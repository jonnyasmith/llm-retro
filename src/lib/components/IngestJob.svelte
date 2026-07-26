<script lang="ts">
  import { invalidateAll, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    harnessLabels,
    type JobRunSummary,
    type Harness,
  } from '$lib/jobs/contracts';
  import { openJobRunEventSource } from '$lib/jobs/job-run-event-source';
  import { JobRunWatch } from '$lib/jobs/job-run-watch.svelte';
  import { onDestroy } from 'svelte';

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
  let watch = $state<JobRunWatch | null>(null);
  let triggerError = $state<string | null>(null);
  let isTriggering = $state(false);

  const percentage = $derived(
    watch === null || watch.filesTotal === 0
      ? 0
      : Math.round((watch.filesDone / watch.filesTotal) * 100),
  );
  const isRunning = $derived(watch !== null && !watch.finished);
  const streamLabel = $derived(
    watch === null
      ? 'idle'
      : watch.connection === 'dropped'
        ? 'dropped — retrying'
        : watch.connection === 'closed' && !watch.finished
          ? 'closed — reload to reconnect'
          : watch.connection,
  );

  function startWatching(correlationId: string) {
    watch?.close();
    watch = new JobRunWatch(correlationId, openJobRunEventSource);
  }

  async function trigger() {
    isTriggering = true;
    triggerError = null;
    try {
      const response = await fetch(`/api/jobs/ingest/${harness}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(await response.text());
      const { correlation_id } = (await response.json()) as {
        correlation_id: string;
      };
      replaceState(
        resolve(
          `/?harness=${encodeURIComponent(harness)}&run=${encodeURIComponent(correlation_id)}`,
        ),
        {},
      );
      startWatching(correlation_id);
    } catch (cause) {
      triggerError = cause instanceof Error ? cause.message : String(cause);
    } finally {
      isTriggering = false;
    }
  }

  $effect(() => {
    const requestedHarness = page.url.searchParams.get('harness');
    const requestedRun = page.url.searchParams.get('run');
    const requested =
      requestedHarness === harness ||
      (requestedHarness === null &&
        runs.some((run) => run.correlationId === requestedRun))
        ? requestedRun
        : null;
    const run = requested ?? activeCorrelationId;
    if (run && run !== watch?.correlationId) startWatching(run);
  });

  $effect(() => {
    if (watch?.finished) void invalidateAll();
  });

  onDestroy(() => watch?.close());
</script>

<section aria-labelledby={`${harness}-ingest-heading`}>
  <div class="section-heading">
    <div>
      <p class="eyebrow">{harnessLabel}</p>
      <h2 id={`${harness}-ingest-heading`}>Ingest session history</h2>
    </div>
    <button onclick={trigger} disabled={isTriggering || isRunning}>
      {isTriggering
        ? 'Starting…'
        : isRunning
          ? 'Ingestion running…'
          : `Ingest ${harnessLabel}`}
    </button>
  </div>

  {#if triggerError}
    <p class="error" role="alert">{triggerError}</p>
  {/if}

  {#if watch}
    <dl class="run-details">
      <div>
        <dt>Run handle</dt>
        <dd>{watch.correlationId}</dd>
      </div>
      <div>
        <dt>Stream</dt>
        <dd>{streamLabel}</dd>
      </div>
    </dl>

    <div class="progress-copy">
      <strong>{percentage}%</strong>
      <span>{watch.filesDone} of {watch.filesTotal} files</span>
    </div>
    <progress
      aria-label={`${harnessLabel} ingest file progress`}
      value={watch.filesDone}
      max={watch.filesTotal || 1}>{percentage}%</progress
    >
    <p class="current-file">
      <span>{watch.finished ? 'Last file' : 'Current file'}</span>
      {watch.currentFile ??
        (watch.finished
          ? 'No file processed'
          : `Discovering ${harnessLabel} sessions…`)}
    </p>

    <div class="terminal" aria-live="polite">
      {#if watch.finished}
        <strong
          class:success={watch.status === 'succeeded'}
          class:interrupted={watch.status === 'interrupted'}
        >
          {watch.status}
        </strong>
        {#if watch.error}<span>{watch.error}</span>{/if}
      {:else}
        <span>{harnessLabel} ingestion in progress</span>
      {/if}
    </div>

    <div class="log-heading">
      <h3>Live log</h3>
      <span>{watch.log.length} messages</span>
    </div>
    <ol class="log" aria-live="polite">
      {#each watch.log as message, index (`${index}:${message}`)}
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
