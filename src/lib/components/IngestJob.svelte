<script lang="ts">
  import { invalidateAll, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import {
    harnessLabels,
    isTerminalJobRunStatus,
    parseJobEventData,
    type JobDonePayload,
    type JobLogPayload,
    type JobProgressPayload,
    type JobRunSummary,
    type Harness,
  } from '$lib/jobs/contracts';
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
  let correlationId = $state<string | null>(null);
  let progress = $state<JobProgressPayload>({
    correlation_id: '',
    files_done: 0,
    files_total: 0,
    current_file: null,
    timestamp: 0,
  });
  let logs = $state<string[]>([]);
  let outcome = $state<JobDonePayload | null>(null);
  let lastFile = $state<string | null>(null);
  let connectionState = $state<'idle' | 'connecting' | 'live' | 'reconnecting'>(
    'idle',
  );
  let triggerError = $state<string | null>(null);
  let isTriggering = $state(false);
  let stream: EventSource | null = null;

  const percentage = $derived(
    progress.files_total === 0
      ? 0
      : Math.round((progress.files_done / progress.files_total) * 100),
  );
  const isRunning = $derived(correlationId !== null && outcome === null);

  function watch(id: string) {
    stream?.close();
    const persisted = runs.find((run) => run.correlationId === id);
    correlationId = id;
    progress = {
      correlation_id: id,
      files_done: persisted?.filesDone ?? 0,
      files_total: persisted?.filesTotal ?? 0,
      current_file: null,
      timestamp: persisted?.startedAt ?? Date.now(),
    };
    logs = [];
    lastFile = null;
    outcome =
      persisted && isTerminalJobRunStatus(persisted.status)
        ? {
            correlation_id: persisted.correlationId,
            status: persisted.status,
            error: persisted.error,
            timestamp: persisted.finishedAt ?? Date.now(),
          }
        : null;
    connectionState = 'connecting';
    stream = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events`);
    stream.addEventListener('open', () => {
      connectionState = 'live';
      logs = [];
    });
    stream.addEventListener('progress', (event) => {
      const nextProgress = parseJobEventData<JobProgressPayload>(event);
      if (nextProgress.current_file) lastFile = nextProgress.current_file;
      if (
        nextProgress.files_total !== progress.files_total ||
        nextProgress.files_done >= progress.files_done
      ) {
        progress = nextProgress;
      }
    });
    stream.addEventListener('log', (event) => {
      const { message } = parseJobEventData<JobLogPayload>(event);
      logs = [...logs.slice(-99), message];
    });
    stream.addEventListener('done', (event) => {
      outcome = parseJobEventData<JobDonePayload>(event);
      connectionState = 'idle';
      stream?.close();
      stream = null;
      void invalidateAll();
    });
    stream.addEventListener('error', () => {
      if (!outcome) connectionState = 'reconnecting';
    });
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
      watch(correlation_id);
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
    if (run && run !== correlationId) watch(run);
  });

  onDestroy(() => stream?.close());
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

  {#if correlationId}
    <dl class="run-details">
      <div>
        <dt>Run handle</dt>
        <dd>{correlationId}</dd>
      </div>
      <div>
        <dt>Stream</dt>
        <dd>{connectionState}</dd>
      </div>
    </dl>

    <div class="progress-copy">
      <strong>{percentage}%</strong>
      <span>{progress.files_done} of {progress.files_total} files</span>
    </div>
    <progress
      aria-label={`${harnessLabel} ingest file progress`}
      value={progress.files_done}
      max={progress.files_total || 1}>{percentage}%</progress
    >
    <p class="current-file">
      <span>{outcome ? 'Last file' : 'Current file'}</span>
      {progress.current_file ??
        lastFile ??
        (outcome
          ? 'No file processed'
          : `Discovering ${harnessLabel} sessions…`)}
    </p>

    <div class="terminal" aria-live="polite">
      {#if outcome}
        <strong
          class:success={outcome.status === 'succeeded'}
          class:interrupted={outcome.status === 'interrupted'}
        >
          {outcome.status}
        </strong>
        {#if outcome.error}<span>{outcome.error}</span>{/if}
      {:else}
        <span>{harnessLabel} ingestion in progress</span>
      {/if}
    </div>

    <div class="log-heading">
      <h3>Live log</h3>
      <span>{logs.length} messages</span>
    </div>
    <ol class="log" aria-live="polite">
      {#each logs as message, index (`${index}:${message}`)}
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
