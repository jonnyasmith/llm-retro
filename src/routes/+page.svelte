<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type Progress = {
    files_done: number;
    files_total: number;
    current_file: string | null;
  };

  type Done = {
    status: 'succeeded' | 'failed' | 'interrupted';
    error: string | null;
  };

  let correlationId = $state<string | null>(null);
  let progress = $state<Progress>({
    files_done: 0,
    files_total: 0,
    current_file: null,
  });
  let logs = $state<string[]>([]);
  let outcome = $state<Done | null>(null);
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
    correlationId = id;
    outcome = null;
    connectionState = 'connecting';
    stream = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events`);
    stream.addEventListener('open', () => {
      connectionState = 'live';
      logs = [];
    });
    stream.addEventListener('progress', (event) => {
      const nextProgress = JSON.parse(event.data) as Progress;
      if (nextProgress.current_file) lastFile = nextProgress.current_file;
      if (
        nextProgress.files_total !== progress.files_total ||
        nextProgress.files_done >= progress.files_done
      ) {
        progress = nextProgress;
      }
    });
    stream.addEventListener('log', (event) => {
      const { message } = JSON.parse(event.data) as { message: string };
      logs = [...logs.slice(-99), message];
    });
    stream.addEventListener('done', (event) => {
      outcome = JSON.parse(event.data) as Done;
      connectionState = 'idle';
      stream?.close();
      stream = null;
    });
    stream.addEventListener('error', () => {
      if (!outcome) connectionState = 'reconnecting';
    });
  }

  async function trigger() {
    isTriggering = true;
    triggerError = null;
    logs = [];
    lastFile = null;
    progress = { files_done: 0, files_total: 0, current_file: null };
    try {
      const response = await fetch('/api/jobs/stub', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error(await response.text());
      const { correlation_id } = (await response.json()) as {
        correlation_id: string;
      };
      const url = new URL(window.location.href);
      url.searchParams.set('run', correlation_id);
      history.replaceState(null, '', url);
      watch(correlation_id);
    } catch (cause) {
      triggerError = cause instanceof Error ? cause.message : String(cause);
    } finally {
      isTriggering = false;
    }
  }

  onMount(() => {
    const run = new URL(window.location.href).searchParams.get('run');
    if (run) watch(run);
  });

  onDestroy(() => stream?.close());
</script>

<svelte:head>
  <title>LLM Retro</title>
  <meta
    name="description"
    content="A local-first view of how you work with coding harnesses."
  />
</svelte:head>

<main>
  <header>
    <p class="eyebrow">Local-first work tracking</p>
    <h1>LLM Retro</h1>
    <p class="lede">Run the foundation Job and watch its progress live.</p>
  </header>

  <section aria-labelledby="stub-job-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Foundation runner</p>
        <h2 id="stub-job-heading">Stub Job</h2>
      </div>
      <button onclick={trigger} disabled={isTriggering || isRunning}>
        {isTriggering
          ? 'Starting…'
          : isRunning
            ? 'Job running…'
            : 'Start stub Job'}
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
      <progress value={progress.files_done} max={progress.files_total || 1}
        >{percentage}%</progress
      >
      <p class="current-file">
        <span>{outcome ? 'Last file' : 'Current file'}</span>
        {progress.current_file ??
          lastFile ??
          (outcome ? 'No file processed' : 'Waiting for progress…')}
      </p>

      <div class="terminal" aria-live="polite">
        {#if outcome}
          <strong class:success={outcome.status === 'succeeded'}>
            {outcome.status}
          </strong>
          {#if outcome.error}<span>{outcome.error}</span>{/if}
        {:else}
          <span>Job run in progress</span>
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
        Start the safe, server-managed fixture to prove the runner from browser
        to database and back.
      </p>
    {/if}
  </section>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    color: #17201b;
    background: #f5f1e8;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }

  main {
    width: min(54rem, calc(100% - 2rem));
    margin: 10vh auto 5rem;
  }

  header {
    margin-bottom: 3rem;
  }

  .eyebrow {
    margin: 0;
    color: #50755b;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.35rem 0;
    font-family: ui-serif, Georgia, serif;
    font-size: clamp(3.2rem, 12vw, 6rem);
    font-weight: 500;
    letter-spacing: -0.06em;
  }

  .lede {
    margin: 0;
    color: #58615c;
    font-size: 1.15rem;
  }

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
    text-transform: capitalize;
  }

  .terminal strong.success {
    color: #317142;
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
    main {
      margin-top: 3rem;
    }

    .section-heading,
    .run-details {
      align-items: stretch;
      grid-template-columns: 1fr;
    }

    .section-heading {
      flex-direction: column;
    }
  }
</style>
