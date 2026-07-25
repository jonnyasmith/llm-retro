<script lang="ts">
  import IngestJob from '$lib/components/IngestJob.svelte';
  import JobRunHistory from '$lib/components/JobRunHistory.svelte';
  import PageIntro from '$lib/components/PageIntro.svelte';
  import { harnesses, harnessLabels } from '$lib/jobs/contracts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const harnessList = new Intl.ListFormat('en-GB').format(
    harnesses.map((harness) => harnessLabels[harness]),
  );
</script>

<svelte:head>
  <title>Jobs · LLM Retro</title>
  <meta
    name="description"
    content="Run {harnessList} ingestion and watch progress and history."
  />
</svelte:head>

<main>
  <PageIntro
    eyebrow="Local-first work tracking"
    title="Jobs"
    description="Bring {harnessList} activity into LLM Retro and watch every run from start to finish."
  />

  {#each harnesses as harness (harness)}
    <IngestJob
      {harness}
      runs={data.ingestJobs[harness].runs}
      activeCorrelationId={data.ingestJobs[harness].activeCorrelationId}
    />
  {/each}
  {#each harnesses as harness (harness)}
    <JobRunHistory {harness} runs={data.ingestJobs[harness].runs} />
  {/each}
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
