<script lang="ts">
  import {
    ingestHarnesses,
    ingestHarnessLabels,
    mapIngestHarnesses,
    type IngestHarness,
  } from '$lib/jobs/contracts';
  import { saveSettings } from '$lib/settings/client';
  import type {
    ApplicationSettings,
    SettingsChanges,
  } from '$lib/settings/contracts';
  import { untrack } from 'svelte';

  let { settings }: { settings: ApplicationSettings } = $props();
  const initialSettings = untrack(() => settings);
  let values = $state(
    mapIngestHarnesses((harness) =>
      initialSettings.logSources[harness].join('\n'),
    ),
  );
  let baselines = $state({ ...values });
  let pinned = $state(
    mapIngestHarnesses(
      (harness) => initialSettings.logSourceOverrides[harness] !== undefined,
    ),
  );
  let saving = $state(false);
  let error = $state('');
  let confirmation = $state('');

  function pathsFrom(value: string): string[] {
    return value
      .split('\n')
      .map((path) => path.trim())
      .filter(Boolean);
  }

  function applyServerState(updatedHarnesses: readonly IngestHarness[]) {
    for (const harness of updatedHarnesses) {
      const value = settings.logSources[harness].join('\n');
      values[harness] = value;
      baselines[harness] = value;
      pinned[harness] = settings.logSourceOverrides[harness] !== undefined;
    }
  }

  async function persist(
    overrides: NonNullable<SettingsChanges['logSourceOverrides']>,
    successMessage: string,
    updatedHarnesses: readonly IngestHarness[],
  ) {
    saving = true;
    error = '';
    confirmation = '';
    try {
      await saveSettings({ logSourceOverrides: overrides });
      applyServerState(updatedHarnesses);
      confirmation = successMessage;
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : 'Unable to save Log source settings';
    } finally {
      saving = false;
    }
  }

  async function save() {
    const changedHarnesses = ingestHarnesses.filter(
      (harness) => values[harness] !== baselines[harness],
    );
    const overrides = Object.fromEntries(
      changedHarnesses.map((harness) => [harness, pathsFrom(values[harness])]),
    );
    await persist(overrides, 'Log source settings saved.', changedHarnesses);
  }

  async function reset(harness: IngestHarness) {
    await persist(
      { [harness]: null },
      `${ingestHarnessLabels[harness]} now follows built-in defaults.`,
      [harness],
    );
  }
</script>

<section aria-labelledby="sources-heading">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Harness discovery</p>
      <h2 id="sources-heading">Log sources</h2>
    </div>
  </div>
  <p class="section-copy">
    Enter one absolute path per line. Paths may point to directories that do not
    exist yet; blank lines are ignored.
  </p>
  <div class="source-list">
    {#each ingestHarnesses as harness (harness)}
      <div class="source">
        <div class="source-heading">
          <div>
            <label for={`source-${harness}`}
              >{ingestHarnessLabels[harness]}</label
            >
            <span class:pinned={pinned[harness]}>
              {pinned[harness]
                ? 'Pinned to your paths'
                : 'Following built-in defaults'}
            </span>
          </div>
          {#if pinned[harness]}
            <button
              class="secondary-button"
              type="button"
              onclick={() => reset(harness)}
              disabled={saving}>Reset to defaults</button
            >
          {/if}
        </div>
        <textarea
          id={`source-${harness}`}
          rows="3"
          bind:value={values[harness]}
          spellcheck="false"></textarea>
      </div>
    {/each}
  </div>
  <div class="actions">
    <button type="button" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : 'Save Log sources'}
    </button>
    {#if error}<p class="message error">{error}</p>{/if}
    {#if confirmation}
      <p class="message confirmation">{confirmation}</p>
    {/if}
  </div>
</section>
