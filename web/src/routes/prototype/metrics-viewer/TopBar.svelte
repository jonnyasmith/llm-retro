<script lang="ts">
	import { fmtK, type Aggregate } from './aggregate';
	import { useViewerState, type View } from './viewerState.svelte';

	let { a }: { a: Aggregate } = $props();

	const st = useViewerState();

	const tabs: { view: View; label: string }[] = [
		{ view: 'overview', label: 'Overview' },
		{ view: 'sessions', label: 'Sessions' },
		{ view: 'insights', label: 'Insights' },
		{ view: 'jobs', label: 'Jobs' }
	];
</script>

<div class="topbar">
	<div class="brand"><span class="logo"></span> LLM Retro <small>· prototype</small></div>
	<nav class="viewtabs">
		{#each tabs as tab (tab.view)}
			<button class:on={st.view === tab.view} onclick={() => (st.view = tab.view)}
				>{tab.label}</button
			>
		{/each}
	</nav>
	<div class="spacer"></div>
	<div class="scope-note">{a.sessions} sessions · {fmtK(a.totalTokens)} tokens in scope</div>
</div>
