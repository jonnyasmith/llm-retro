<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Row, Spacer, Text } from '$lib/design-system';
	import type { Provenance } from '../../model/Inference.types';
	import ProvenanceStamp from '../molecules/ProvenanceStamp.svelte';

	let {
		heading,
		description,
		action,
		provenance,
		now
	}: {
		heading: string;
		description: Snippet;
		action?: Snippet;
		provenance?: Provenance;
		now?: Date;
	} = $props();
</script>

<div class="detail-header">
	<Row>
		<h2>{heading}</h2>
		{#if action}<Spacer />{@render action()}{/if}
	</Row>
	<Text tone="muted" class="description">{@render description()}</Text>
	{#if provenance}<ProvenanceStamp {provenance} {now} />{/if}
</div>

<style>
	.detail-header {
		border-bottom: 1px solid var(--line);
		padding-bottom: var(--space-5);
		margin-bottom: 14px;
	}
	h2 {
		font-size: 18px;
	}
	.detail-header :global(.description) {
		display: block;
		margin-top: 2px;
	}
</style>
