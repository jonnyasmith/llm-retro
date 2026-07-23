<script lang="ts">
  import PageIntro from '$lib/components/PageIntro.svelte';
  import { formatDuration } from '$lib/format';
  import { ingestHarnessLabels, type IngestHarness } from '$lib/jobs/contracts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const number = new Intl.NumberFormat('en-GB');
  const average = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
  const totals = $derived(data.sessions.totals);
  const byHarness = $derived(data.sessions.byHarness);

  function harnessLabel(harness: string): string {
    return ingestHarnessLabels[harness as IngestHarness] ?? harness;
  }

  function excludedNote(count: number): string {
    if (count === 0) return '';
    const sessions = count === 1 ? 'Session' : 'Sessions';
    return `${number.format(count)} ${sessions} excluded (no measurable duration)`;
  }
</script>

<svelte:head>
  <title>Sessions · LLM Retro</title>
  <meta
    name="description"
    content="The shape of your Sessions: counts, average Interactions, and average duration by Harness."
  />
</svelte:head>

<main>
  <PageIntro
    eyebrow="How I work"
    title="Sessions"
    description="The shape of your Sessions — how many Interactions they hold and how long they run."
  />

  <section aria-labelledby="sessions-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">All recorded activity</p>
        <h2 id="sessions-heading">Session shape</h2>
      </div>
      <span class="scope">All time</span>
    </div>

    {#if totals.sessionCount === 0}
      <p class="empty">
        No Sessions have been recorded yet. Run ingestion from Jobs to populate
        this view.
      </p>
    {:else}
      <div class="metrics">
        <article>
          <span>Sessions</span>
          <strong>{number.format(totals.sessionCount)}</strong>
          <p>Distinct Sessions captured across every Harness.</p>
        </article>
        <article>
          <span>Avg Interactions / Session</span>
          <strong>{average.format(totals.averageInteractionsPerSession)}</strong
          >
          <p>Whether Sessions are quick pokes or sustained work.</p>
        </article>
        <article>
          <span>Avg duration</span>
          <strong>{formatDuration(totals.averageDurationMs)}</strong>
          <p>
            How long you typically stay in a Session.
            {#if totals.durationExcluded > 0}
              <span class="footnote"
                >{excludedNote(totals.durationExcluded)}.</span
              >
            {/if}
          </p>
        </article>
      </div>

      <div class="breakdown-table">
        <table>
          <thead>
            <tr>
              <th>Harness</th>
              <th class="numeric">Sessions</th>
              <th class="numeric">Interactions</th>
              <th class="numeric">Avg Interactions / Session</th>
              <th class="numeric">Avg duration</th>
            </tr>
          </thead>
          <tbody>
            {#each byHarness as row (row.harness)}
              <tr>
                <td><span class="label">{harnessLabel(row.harness)}</span></td>
                <td class="numeric">{number.format(row.sessionCount)}</td>
                <td class="numeric">{number.format(row.interactionCount)}</td>
                <td class="numeric"
                  >{average.format(row.averageInteractionsPerSession)}</td
                >
                <td class="numeric">
                  {formatDuration(row.averageDurationMs)}
                  {#if row.durationExcluded > 0}
                    <span class="footnote"
                      >{excludedNote(row.durationExcluded)}</span
                    >
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
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

  .empty {
    margin: 1.5rem 0 0;
    padding-top: 1.25rem;
    border-top: 1px solid #e6dfd2;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
    font-size: clamp(2rem, 6vw, 3.25rem);
    font-weight: 500;
    line-height: 1;
  }

  article p {
    margin: 0;
  }

  .footnote {
    display: block;
    margin-top: 0.35rem;
    color: #8a5b16;
    font-size: 0.8rem;
    white-space: normal;
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
    vertical-align: top;
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

  @media (max-width: 48rem) {
    .metrics {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 36rem) {
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
