<script lang="ts">
  import { saveSettings } from '$lib/settings/client';
  import type { ApplicationSettings } from '$lib/settings/contracts';
  import { untrack } from 'svelte';

  let { settings }: { settings: ApplicationSettings } = $props();
  const initialSettings = untrack(() => settings);
  let enabled = $state(initialSettings.rawArchiveEnabled);
  let path = $state(initialSettings.rawArchivePath ?? '');
  let saving = $state(false);
  let error = $state('');
  let confirmation = $state('');

  async function save() {
    saving = true;
    error = '';
    confirmation = '';
    try {
      const trimmedPath = path.trim();
      await saveSettings({
        rawArchiveEnabled: enabled,
        rawArchivePath: trimmedPath.length === 0 ? null : trimmedPath,
      });
      enabled = settings.rawArchiveEnabled;
      path = settings.rawArchivePath ?? '';
      confirmation = 'Raw archive settings saved.';
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : 'Unable to save Raw archive settings';
    } finally {
      saving = false;
    }
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
    <button type="button" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : 'Save Raw archive'}
    </button>
    {#if error}<p class="message error">{error}</p>{/if}
    {#if confirmation}
      <p class="message confirmation">{confirmation}</p>
    {/if}
  </div>
</section>
