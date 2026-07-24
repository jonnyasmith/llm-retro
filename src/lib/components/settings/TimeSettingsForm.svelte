<script lang="ts">
  import { saveSettings } from '$lib/settings/client';
  import type { ApplicationSettings } from '$lib/settings/contracts';
  import { untrack } from 'svelte';

  let {
    settings,
    timezones,
  }: { settings: ApplicationSettings; timezones: string[] } = $props();
  let timezone = $state(untrack(() => settings.timezone));
  let saving = $state(false);
  let error = $state('');
  let confirmation = $state('');

  async function save() {
    saving = true;
    error = '';
    confirmation = '';
    try {
      await saveSettings({ timezone });
      timezone = settings.timezone;
      confirmation = 'Time settings saved.';
    } catch (cause) {
      error =
        cause instanceof Error ? cause.message : 'Unable to save time settings';
    } finally {
      saving = false;
    }
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
    <button type="button" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : 'Save Time'}
    </button>
    {#if error}<p class="message error">{error}</p>{/if}
    {#if confirmation}
      <p class="message confirmation">{confirmation}</p>
    {/if}
  </div>
</section>
