<script lang="ts">
	import { allModels, type Aggregate } from './aggregate';
	import { ALL, TOOLS } from './data';
	import { useViewerState } from './viewerState.svelte';
	import { Segmented, Spacer, Toggle } from '$lib/ui';

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
			<Toggle pressed={st.tools.has(t)} tone={t} onclick={() => st.toggleTool(t)}>
				<span class="dot" style="background:var(--{t})"></span>{t}
			</Toggle>
		{/each}
	</div>
	<div class="fgroup">
		<span class="flabel">Model</span>
		{#each models as m (m)}
			<Toggle tone="model" pressed={st.models.has(m)} onclick={() => st.toggleModel(m)}>{m}</Toggle>
		{/each}
	</div>
	<div class="fgroup">
		<span class="flabel">Date</span>
		<Segmented
			variant="outline"
			label="Date range"
			options={dateRanges.map(([d, l]) => ({ value: d, label: l }))}
			value={st.days}
			onchange={(v) => (st.days = v)}
		/>
	</div>
	<Spacer />
	<div class="filter-summary">
		Filtered: <b>{a.sessions}</b>/{ALL.length} sessions · {st.models.size
			? [...st.models].join(', ')
			: 'all models'}
	</div>
</div>

<style>
	.filters {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
		padding: 10px 22px;
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		position: sticky;
		top: 57px;
		z-index: 15;
	}
	.fgroup {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.fgroup > .flabel {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--dim);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.filter-summary {
		font-size: 12px;
		color: var(--dim);
	}
	.filter-summary b {
		color: var(--muted);
	}
</style>
