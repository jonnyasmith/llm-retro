<script lang="ts">
  import { harnesses, harnessLabels, mapHarnesses } from '$lib/jobs/contracts';
  import { saveSettings } from '$lib/settings/client';
  import type { ApplicationSettings } from '$lib/settings/contracts';
  import {
    clearLogSource,
    pinChangedLogSources,
    type LogSourceEdit,
  } from '$lib/settings/log-sources';
  import { SettingsSave } from '$lib/settings/save.svelte';
  import { untrack } from 'svelte';

  let { settings }: { settings: ApplicationSettings } = $props();
  const initialSettings = untrack(() => settings);
  let values = $state(
    mapHarnesses((harness) => initialSettings.logSources[harness].join('\n')),
  );
  let baselines = $state({ ...values });
  let pinned = $state(
    mapHarnesses(
      (harness) => initialSettings.logSourceOverrides[harness] !== undefined,
    ),
  );
  const save = new SettingsSave(
    saveSettings,
    'Unable to save Log source settings',
  );

  function submit(edit: LogSourceEdit, confirmation: string) {
    return save.attempt({
      changes: { logSourceOverrides: edit.overrides },
      confirmation,
      adopt: () => {
        for (const harness of edit.harnesses) {
          const value = settings.logSources[harness].join('\n');
          values[harness] = value;
          baselines[harness] = value;
          pinned[harness] = settings.logSourceOverrides[harness] !== undefined;
        }
      },
    });
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
    {#each harnesses as harness (harness)}
      <div class="source">
        <div class="source-heading">
          <div>
            <label for={`source-${harness}`}>{harnessLabels[harness]}</label>
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
              onclick={() =>
                submit(
                  clearLogSource(harness),
                  `${harnessLabels[harness]} now follows built-in defaults.`,
                )}
              disabled={save.saving}>Reset to defaults</button
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
    <button
      type="button"
      onclick={() =>
        submit(
          pinChangedLogSources(values, baselines),
          'Log source settings saved.',
        )}
      disabled={save.saving}
    >
      {save.saving ? 'Saving…' : 'Save Log sources'}
    </button>
    {#if save.error}<p class="message error">{save.error}</p>{/if}
    {#if save.confirmation}
      <p class="message confirmation">{save.confirmation}</p>
    {/if}
  </div>
</section>
