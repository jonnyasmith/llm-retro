<script lang="ts">
	import { allModels, type Aggregate } from './aggregate';
	import { ALL, TOOLS } from './data';
	import { useViewerState } from './viewerState.svelte';

	let { a }: { a: Aggregate } = $props();

	const st = useViewerState();

	const models = allModels(ALL);
	const dateRanges: [number, string][] = [
		[7, '7d'],
		[21, '21d'],
		[90, '90d']
	];
</script>

<div class="filters">
	<div class="fgroup">
		<span class="flabel">Tool</span>
		{#each TOOLS as t (t)}
			<span class="pill tool-{t}" class:on={st.tools.has(t)} onclick={() => st.toggleTool(t)}>
				<span class="dot" style="background:var(--{t})"></span>{t}
			</span>
		{/each}
	</div>
	<div class="fgroup">
		<span class="flabel">Model</span>
		{#each models as m (m)}
			<span class="pill model" class:on={st.models.has(m)} onclick={() => st.toggleModel(m)}>{m}</span>
		{/each}
	</div>
	<div class="fgroup">
		<span class="flabel">Date</span>
		<div class="daterange">
			{#each dateRanges as [d, l] (d)}
				<button class:on={st.days === d} onclick={() => (st.days = d)}>{l}</button>
			{/each}
		</div>
	</div>
	<div class="spacer"></div>
	<div class="filter-summary">
		Filtered: <b>{a.sessions}</b>/{ALL.length} sessions · {st.models.size
			? [...st.models].join(', ')
			: 'all models'}
	</div>
</div>
