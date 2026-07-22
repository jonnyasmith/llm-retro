<script lang="ts">
  import ClaudeIngestJob from '$lib/components/ClaudeIngestJob.svelte';
  import JobRunHistory from '$lib/components/JobRunHistory.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Jobs · LLM Retro</title>
  <meta
    name="description"
    content="Run Claude ingestion and watch its progress and history."
  />
</svelte:head>

<main>
  <header>
    <p class="eyebrow">Local-first work tracking</p>
    <h1>Jobs</h1>
    <p class="lede">
      Bring your Claude activity into LLM Retro and watch every run from start
      to finish.
    </p>
  </header>

  <ClaudeIngestJob
    runs={data.runs}
    activeCorrelationId={data.activeCorrelationId}
  />
  <JobRunHistory runs={data.runs} />
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
    width: min(64rem, calc(100% - 2rem));
    margin: 8vh auto 5rem;
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
    max-width: 42rem;
    margin: 0;
    color: #58615c;
    font-size: 1.15rem;
  }

  @media (max-width: 36rem) {
    main {
      margin-top: 3rem;
    }
  }
</style>
