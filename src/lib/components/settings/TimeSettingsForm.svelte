<script lang="ts">
  import { saveSettings } from '$lib/settings/client';
  import type { ApplicationSettings } from '$lib/settings/contracts';
  import { SettingsSave } from '$lib/settings/save.svelte';
  import { untrack } from 'svelte';

  let {
    settings,
    timezones,
  }: { settings: ApplicationSettings; timezones: string[] } = $props();
  let timezone = $state(untrack(() => settings.timezone));
  const save = new SettingsSave(saveSettings, 'Unable to save time settings');

  function submit() {
    return save.attempt({
      changes: { timezone },
      confirmation: 'Time settings saved.',
      adopt: () => {
        timezone = settings.timezone;
      },
    });
  }
</script>

<section aria-labelledby="time-heading">
  <div class="section-heading">
    <div>
      <p class="eyebrow">History buckets</p>
      <h2 id="time-heading">Time</h2>
    </div>
  </div>
  <p class="section-copy">
    Saving a timezone rebuilds local-time buckets across your full history and
    may take a moment.
  </p>
  <label for="timezone">Timezone</label>
  <select id="timezone" bind:value={timezone}>
    {#each timezones as zone (zone)}
      <option value={zone}>{zone}</option>
    {/each}
  </select>
  <div class="actions">
    <button type="button" onclick={submit} disabled={save.saving}>
      {save.saving ? 'Saving…' : 'Save Time'}
    </button>
    {#if save.error}<p class="message error">{save.error}</p>{/if}
    {#if save.confirmation}
      <p class="message confirmation">{save.confirmation}</p>
    {/if}
  </div>
</section>
