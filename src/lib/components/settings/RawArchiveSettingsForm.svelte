<script lang="ts">
  import { archivePathFrom } from '$lib/settings/archive-path';
  import { saveSettings } from '$lib/settings/client';
  import type { ApplicationSettings } from '$lib/settings/contracts';
  import { SettingsSave } from '$lib/settings/save.svelte';
  import { untrack } from 'svelte';

  let { settings }: { settings: ApplicationSettings } = $props();
  const initialSettings = untrack(() => settings);
  let enabled = $state(initialSettings.rawArchiveEnabled);
  let path = $state(initialSettings.rawArchivePath ?? '');
  const save = new SettingsSave(
    saveSettings,
    'Unable to save Raw archive settings',
  );

  function submit() {
    return save.attempt({
      changes: {
        rawArchiveEnabled: enabled,
        rawArchivePath: archivePathFrom(path),
      },
      confirmation: 'Raw archive settings saved.',
      adopt: () => {
        enabled = settings.rawArchiveEnabled;
        path = settings.rawArchivePath ?? '';
      },
    });
  }
</script>

<section aria-labelledby="archive-heading">
  <div class="section-heading">
    <div>
      <p class="eyebrow">Untouched source files</p>
      <h2 id="archive-heading">Raw archive</h2>
    </div>
    <label class="toggle">
      <input type="checkbox" bind:checked={enabled} />
      <span>{enabled ? 'Enabled' : 'Disabled'}</span>
    </label>
  </div>
  <p class="section-copy">
    Preserve a copy of source logs under an app-owned root. Disabling the
    archive keeps the configured path for later.
  </p>
  <label for="archive-path">Archive root</label>
  <input
    id="archive-path"
    type="text"
    bind:value={path}
    placeholder="/absolute/path/to/archive"
    spellcheck="false"
  />
  <div class="actions">
    <button type="button" onclick={submit} disabled={save.saving}>
      {save.saving ? 'Saving…' : 'Save Raw archive'}
    </button>
    {#if save.error}<p class="message error">{save.error}</p>{/if}
    {#if save.confirmation}
      <p class="message confirmation">{save.confirmation}</p>
    {/if}
  </div>
</section>
