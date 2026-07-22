<script lang="ts">
  import PageIntro from '$lib/components/PageIntro.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const number = new Intl.NumberFormat('en-GB');
</script>

<svelte:head>
  <title>Overview · LLM Retro</title>
  <meta
    name="description"
    content="Headline Interaction and token usage totals."
  />
</svelte:head>

<main>
  <PageIntro
    eyebrow="How I work"
    title="Overview"
    description="A compact view of the work captured across your coding Harnesses."
  />

  <section aria-labelledby="headline-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">All recorded activity</p>
        <h2 id="headline-heading">Headline totals</h2>
      </div>
      <span class="scope">All time</span>
    </div>

    <div class="metrics">
      <article>
        <span>Interactions</span>
        <strong>{number.format(data.totals.interactionCount)}</strong>
        <p>User-initiated work that received a Model response.</p>
      </article>
      <article>
        <span>Total tokens</span>
        <strong>{number.format(data.totals.totalTokens)}</strong>
        <p>Main and sub-agent usage across every canonical token bucket.</p>
      </article>
    </div>

    {#if data.totals.interactionCount === 0}
      <p class="empty">
        No Interactions have been recorded yet. Run Claude ingestion from Jobs
        to populate this overview.
      </p>
    {/if}
  </section>
</main>

<style>
  main {
    width: min(64rem, calc(100% - 2rem));
    margin: 8vh auto 5rem;
  }

  section {
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

  .scope,
  .empty,
  article p {
    color: #6d756f;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 1.5rem;
  }

  article {
    display: grid;
    gap: 0.5rem;
    padding: clamp(1.25rem, 4vw, 2rem);
    border: 1px solid #e6dfd2;
    border-radius: 0.8rem;
    background: #f8f5ed;
  }

  article > span {
    color: #50755b;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  article strong {
    font-family: ui-serif, Georgia, serif;
    font-size: clamp(2.5rem, 8vw, 4.5rem);
    font-weight: 500;
    line-height: 1;
  }

  article p {
    margin: 0;
  }

  .empty {
    margin: 1.5rem 0 0;
    padding-top: 1.25rem;
    border-top: 1px solid #e6dfd2;
  }

  @media (max-width: 40rem) {
    main {
      margin-top: 3rem;
    }

    .metrics {
      grid-template-columns: 1fr;
    }
  }
</style>
