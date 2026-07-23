<script lang="ts">
  import PageIntro from '$lib/components/PageIntro.svelte';
  import { formatTokens } from '$lib/format';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const number = new Intl.NumberFormat('en-GB');
</script>

<svelte:head>
  <title>Projects · LLM Retro</title>
  <meta
    name="description"
    content="Every Project ranked by how much work it absorbed."
  />
</svelte:head>

<main>
  <PageIntro
    eyebrow="How I work"
    title="Projects"
    description="Where your effort actually goes, ranked by Interaction volume across every repository."
  />

  <section aria-labelledby="projects-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">All recorded activity</p>
        <h2 id="projects-heading">By Project</h2>
      </div>
      <span class="scope">All time</span>
    </div>

    {#if data.projects.length === 0}
      <p class="empty">
        No Interactions have been recorded yet. Run ingestion from Jobs to
        populate this view.
      </p>
    {:else}
      <div class="breakdown-table">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th class="numeric">Interactions</th>
              <th class="numeric">Input</th>
              <th class="numeric">Output</th>
              <th class="numeric">Cache read</th>
              <th class="numeric">Cache write</th>
              <th class="numeric">Total tokens</th>
            </tr>
          </thead>
          <tbody>
            {#each data.projects as project (project.projectId)}
              <tr>
                <td>
                  <span class="label">{project.rootPath}</span>
                  {#if project.gitRemoteUrl}
                    <span class="secondary">{project.gitRemoteUrl}</span>
                  {/if}
                </td>
                <td class="numeric"
                  >{number.format(project.interactionCount)}</td
                >
                <td class="numeric">{formatTokens(project.inputTokens)}</td>
                <td class="numeric">{formatTokens(project.outputTokens)}</td>
                <td class="numeric">{formatTokens(project.cacheReadTokens)}</td>
                <td class="numeric">{formatTokens(project.cacheWriteTokens)}</td
                >
                <td class="numeric">{formatTokens(project.totalTokens)}</td>
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
  .secondary {
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
    display: block;
    font-weight: 700;
  }

  .secondary {
    display: block;
    font-size: 0.85rem;
  }

  @media (max-width: 36rem) {
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
