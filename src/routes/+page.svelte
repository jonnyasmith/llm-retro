<script lang="ts">
  import ClaudeIngestJob from '$lib/components/ClaudeIngestJob.svelte';
  import JobRunHistory from '$lib/components/JobRunHistory.svelte';
  import PageIntro from '$lib/components/PageIntro.svelte';
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
  <PageIntro
    eyebrow="Local-first work tracking"
    title="Jobs"
    description="Bring your Claude activity into LLM Retro and watch every run from start to finish."
  />

  <ClaudeIngestJob
    runs={data.runs}
    activeCorrelationId={data.activeCorrelationId}
  />
  <JobRunHistory runs={data.runs} />
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
