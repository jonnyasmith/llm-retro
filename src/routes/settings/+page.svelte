<script lang="ts">
  import LogSourcesSettingsForm from '$lib/components/settings/LogSourcesSettingsForm.svelte';
  import RawArchiveSettingsForm from '$lib/components/settings/RawArchiveSettingsForm.svelte';
  import TimeSettingsForm from '$lib/components/settings/TimeSettingsForm.svelte';
  import PageIntro from '$lib/components/PageIntro.svelte';
  import type { PageProps } from './$types';
  import './settings.css';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Settings · LLM Retro</title>
  <meta
    name="description"
    content="Configure time, Raw archive, and Harness Log sources."
  />
</svelte:head>

<main class="settings-page">
  <PageIntro
    eyebrow="Application preferences"
    title="Settings"
    description="Choose how LLM Retro buckets your history, protects source files, and finds each Harness."
  />
  <TimeSettingsForm settings={data.settings} timezones={data.timezones} />
  <RawArchiveSettingsForm settings={data.settings} />
  <LogSourcesSettingsForm settings={data.settings} />
</main>

<style>
  main {
    width: min(64rem, calc(100% - 2rem));
    margin: 8vh auto 5rem;
  }

  @media (max-width: 36rem) {
    main {
      margin-top: 3rem;
    }
  }
</style>
