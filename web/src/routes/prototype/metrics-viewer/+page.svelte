<script lang="ts">
	import './metrics-viewer.css';
	import { ALL } from './data';
	import { agg, filtered } from './aggregate';
	import { provideViewerState } from './viewerState.svelte';
	import TopBar from './TopBar.svelte';
	import FilterBar from './FilterBar.svelte';
	import OverviewView from './OverviewView.svelte';
	import SessionsView from './SessionsView.svelte';
	import InsightsView from './InsightsView.svelte';
	import JobsView from './JobsView.svelte';

	const st = provideViewerState();
	const f = $derived(filtered(ALL, st));
	const a = $derived(agg(f));
</script>

<svelte:head>
	<title>PROTOTYPE — Metrics + Insights Viewer</title>
</svelte:head>

<div class="mv">
	<div class="app">
		<TopBar {a} />
		<FilterBar {a} />
		<div class="main">
			{#if st.view === 'overview'}
				<OverviewView {f} {a} />
			{:else if st.view === 'sessions'}
				<SessionsView {f} {a} />
			{:else if st.view === 'insights'}
				<InsightsView {f} />
			{:else}
				<JobsView />
			{/if}
		</div>
	</div>
</div>
