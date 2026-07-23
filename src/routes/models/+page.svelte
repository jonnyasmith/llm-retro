<script lang="ts">
  import PageIntro from '$lib/components/PageIntro.svelte';
  import { formatTokens } from '$lib/format';
  import { ingestHarnessLabels, type IngestHarness } from '$lib/jobs/contracts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const number = new Intl.NumberFormat('en-GB');
  const empty = $derived(
    data.harnesses.length === 0 && data.models.length === 0,
  );

  function harnessLabel(harness: string): string {
    return ingestHarnessLabels[harness as IngestHarness] ?? harness;
  }
</script>

<svelte:head>
  <title>Models &amp; Harnesses · LLM Retro</title>
  <meta
    name="description"
    content="Your Harness mix and canonical-Model mix across all recorded activity."
  />
</svelte:head>

<main>
  <PageIntro
    eyebrow="How I work"
    title="Models &amp; Harnesses"
    description="Which Harnesses you lean on and which Models you actually reach for, summed across every Harness."
  />

  {#if empty}
    <section aria-labelledby="models-empty-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">All recorded activity</p>
          <h2 id="models-empty-heading">By Harness</h2>
        </div>
        <span class="scope">All time</span>
      </div>
      <p class="empty">
        No Interactions have been recorded yet. Run ingestion from Jobs to
        populate this view.
      </p>
    </section>
  {:else}
    <section aria-labelledby="harness-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">All recorded activity</p>
          <h2 id="harness-heading">By Harness</h2>
        </div>
        <span class="scope">All time</span>
      </div>

      <div class="breakdown-table">
        <table>
          <thead>
            <tr>
              <th>Harness</th>
              <th class="numeric">Interactions</th>
              <th class="numeric">Input</th>
              <th class="numeric">Output</th>
              <th class="numeric">Cache read</th>
              <th class="numeric">Cache write</th>
              <th class="numeric">Total tokens</th>
            </tr>
          </thead>
          <tbody>
            {#each data.harnesses as row (row.harness)}
              <tr>
                <td><span class="label">{harnessLabel(row.harness)}</span></td>
                <td class="numeric">{number.format(row.interactionCount)}</td>
                <td class="numeric">{formatTokens(row.inputTokens)}</td>
                <td class="numeric">{formatTokens(row.outputTokens)}</td>
                <td class="numeric">{formatTokens(row.cacheReadTokens)}</td>
                <td class="numeric">{formatTokens(row.cacheWriteTokens)}</td>
                <td class="numeric">{formatTokens(row.totalTokens)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section aria-labelledby="model-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">All recorded activity</p>
          <h2 id="model-heading">By Model</h2>
        </div>
        <span class="scope">All time</span>
      </div>

      <div class="breakdown-table">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th class="numeric">Interactions</th>
              <th class="numeric">Input</th>
              <th class="numeric">Output</th>
              <th class="numeric">Cache read</th>
              <th class="numeric">Cache write</th>
              <th class="numeric">Total tokens</th>
            </tr>
          </thead>
          <tbody>
            {#each data.models as row (row.model)}
              <tr>
                <td><span class="label">{row.model}</span></td>
                <td>{row.provider}</td>
                <td class="numeric">{number.format(row.interactionCount)}</td>
                <td class="numeric">{formatTokens(row.inputTokens)}</td>
                <td class="numeric">{formatTokens(row.outputTokens)}</td>
                <td class="numeric">{formatTokens(row.cacheReadTokens)}</td>
                <td class="numeric">{formatTokens(row.cacheWriteTokens)}</td>
                <td class="numeric">{formatTokens(row.totalTokens)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
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

  section + section {
    margin-top: 1.5rem;
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
  .empty {
    color: #6d756f;
  }

  .empty {
    margin: 1.5rem 0 0;
    padding-top: 1.25rem;
    border-top: 1px solid #e6dfd2;
  }

  .breakdown-table {
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

  th.numeric,
  td.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  th:first-child,
  td:first-child {
    padding-left: 0;
  }

  th:last-child,
  td:last-child {
    padding-right: 0;
  }

  .label {
    font-weight: 700;
  }

  @media (max-width: 36rem) {
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
