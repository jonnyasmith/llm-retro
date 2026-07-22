<script lang="ts">
  import PageIntro from '$lib/components/PageIntro.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const days = [
    { index: 1, label: 'Monday', short: 'Mon' },
    { index: 2, label: 'Tuesday', short: 'Tue' },
    { index: 3, label: 'Wednesday', short: 'Wed' },
    { index: 4, label: 'Thursday', short: 'Thu' },
    { index: 5, label: 'Friday', short: 'Fri' },
    { index: 6, label: 'Saturday', short: 'Sat' },
    { index: 0, label: 'Sunday', short: 'Sun' },
  ] as const;
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const counts = $derived(
    new Map(
      data.activity.map((cell) => [
        `${cell.localDow}:${cell.localHour}`,
        cell.interactionCount,
      ]),
    ),
  );
  const peak = $derived(
    Math.max(0, ...data.activity.map((cell) => cell.interactionCount)),
  );

  function countFor(localDow: number, localHour: number): number {
    return counts.get(`${localDow}:${localHour}`) ?? 0;
  }

  function levelFor(interactionCount: number): number {
    if (interactionCount === 0) return 0;
    return Math.ceil((interactionCount / peak) * 4);
  }
</script>

<svelte:head>
  <title>Activity · LLM Retro</title>
  <meta
    name="description"
    content="Interaction activity by local day of week and hour."
  />
</svelte:head>

<main>
  <PageIntro
    eyebrow="Working rhythm"
    title="Activity"
    description="See when your user-initiated Interactions happen across a typical local week."
  />

  <section aria-labelledby="activity-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Local time</p>
        <h2 id="activity-heading">Interaction heatmap</h2>
      </div>
      <span class="timezone">{data.timezone}</span>
    </div>

    <p id="heatmap-note" class="note">
      Each cell counts Interactions initiated in that local hour. Darker cells
      represent higher activity relative to the busiest hour.
    </p>

    {#if data.activity.length === 0}
      <p class="empty">
        No Interactions have been recorded yet. The complete week is shown with
        zero activity until ingestion adds data.
      </p>
    {/if}

    <!-- svelte-ignore a11y_no_noninteractive_tabindex (the overflow region must be keyboard-scrollable) -->
    <div
      class="heatmap-scroll"
      tabindex="0"
      role="region"
      aria-label="Activity heatmap table"
    >
      <table aria-describedby="heatmap-note">
        <caption>Interaction counts in {data.timezone}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {#each hours as hour (hour)}
              <th scope="col"><span>{String(hour).padStart(2, '0')}</span></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each days as day (day.index)}
            <tr>
              <th scope="row"><span>{day.short}</span><b>{day.label}</b></th>
              {#each hours as hour (hour)}
                {@const interactionCount = countFor(day.index, hour)}
                <td data-level={levelFor(interactionCount)}>
                  <span
                    title={`${day.label} ${String(hour).padStart(2, '0')}:00 — ${interactionCount} Interactions`}
                    aria-label={`${day.label} at ${String(hour).padStart(2, '0')}:00: ${interactionCount} Interactions`}
                    >{interactionCount}</span
                  >
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="legend" aria-hidden="true">
      <span>Less</span>
      {#each [0, 1, 2, 3, 4] as level (level)}
        <i data-level={level}></i>
      {/each}
      <span>More</span>
    </div>
  </section>
</main>

<style>
  main {
    width: min(76rem, calc(100% - 2rem));
    margin: 8vh auto 5rem;
  }

  section {
    padding: clamp(1.25rem, 3vw, 2.25rem);
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

  .timezone {
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    color: #315b3d;
    background: #e7eee8;
    font-weight: 700;
  }

  .note,
  .empty {
    color: #6d756f;
  }

  .note {
    max-width: 48rem;
    margin: 1rem 0 0;
  }

  .empty {
    margin: 1rem 0 0;
    padding: 0.8rem 1rem;
    border-left: 3px solid #c18a3b;
    background: #f8f5ed;
  }

  .heatmap-scroll {
    overflow-x: auto;
    margin-top: 1.5rem;
    border-radius: 0.7rem;
  }

  .heatmap-scroll:focus-visible {
    outline: 3px solid #c18a3b;
    outline-offset: 3px;
  }

  table {
    width: 100%;
    min-width: 68rem;
    border-collapse: separate;
    border-spacing: 0.22rem;
  }

  caption {
    padding-bottom: 0.75rem;
    color: #58615c;
    font-weight: 700;
    text-align: left;
  }

  th {
    color: #6d756f;
    font-size: 0.72rem;
    font-weight: 700;
  }

  thead th:not(:first-child) {
    text-align: center;
  }

  tbody th {
    position: sticky;
    left: 0;
    z-index: 1;
    padding-right: 0.65rem;
    background: #fffdf8;
    text-align: left;
  }

  tbody th b {
    display: none;
  }

  td {
    width: 2.4rem;
    height: 2.4rem;
    padding: 0;
    border-radius: 0.28rem;
    background: #edf1eb;
    text-align: center;
  }

  td span {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: #435048;
    font-size: 0.72rem;
  }

  [data-level='1'] {
    background: #d8e5da;
  }

  [data-level='2'] {
    background: #a9c6ae;
  }

  [data-level='3'] {
    background: #477553;
  }

  [data-level='4'] {
    background: #315b3d;
  }

  td[data-level='3'] span,
  td[data-level='4'] span {
    color: #fff;
  }

  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
    margin-top: 1rem;
    color: #6d756f;
    font-size: 0.75rem;
  }

  .legend i {
    width: 1rem;
    height: 1rem;
    border-radius: 0.2rem;
    background: #edf1eb;
  }

  @media (max-width: 40rem) {
    main {
      margin-top: 3rem;
    }

    .section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
