<script lang="ts">
  import IngestJob from '$lib/components/IngestJob.svelte';
  import JobRunHistory from '$lib/components/JobRunHistory.svelte';
  import PageIntro from '$lib/components/PageIntro.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Jobs · LLM Retro</title>
  <meta
    name="description"
    content="Run Claude and pi ingestion and watch progress and history."
  />
</svelte:head>

<main>
  <PageIntro
    eyebrow="Local-first work tracking"
    title="Jobs"
    description="Bring Claude and pi activity into LLM Retro and watch every run from start to finish."
  />

  <IngestJob
    harness="claude"
    runs={data.claudeRuns}
    activeCorrelationId={data.claudeActiveCorrelationId}
  />
  <IngestJob
    harness="pi"
    runs={data.piRuns}
    activeCorrelationId={data.piActiveCorrelationId}
  />
  <JobRunHistory harness="claude" runs={data.claudeRuns} />
  <JobRunHistory harness="pi" runs={data.piRuns} />
</main>

<style>
  main {
    width: min(64rem, calc(100% - 2rem));
    margin: 8vh auto 5rem;
  }

  @media (max-width: 36rem) {
    main {
      margin-top: 3rem;
    }
  }
</style>
