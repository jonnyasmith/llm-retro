<script lang="ts">
	import { Badge } from '$lib/ui';
	import type { InsightRailEntry } from './InsightPresentation.types';

	let { entry }: { entry: InsightRailEntry } = $props();

	const markers = $derived(entry.markers ?? []);
</script>

<div class="top">
	{#if entry.tool}<Badge tone={entry.tool}>{entry.tool}</Badge>{/if}<span class="title"
		>{entry.title}</span
	>
</div>
<div class="metadata">
	{entry.metadata}
	{#each markers as marker (marker.accent)}
		<span class="marker" style:color={`var(${marker.accent})`}>
			{marker.icon}{marker.count}
		</span>
	{/each}
</div>

<style>
	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.title {
		font-weight: 600;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.metadata {
		font-size: 11.5px;
		color: var(--dim);
		margin-top: 3px;
	}
	.marker {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 700;
		margin-left: var(--space-1);
	}
</style>
