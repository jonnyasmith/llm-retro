<script lang="ts">
	import { AccentPanel } from '$lib/design-system';
	import { INFERENCE_PRESENTATION } from '../../model/Inference.presentation';
	import type { Inference } from '../../model/Inference.types';
	import InferenceSummary from '../molecules/InferenceSummary.svelte';

	let { inference, now }: { inference: Inference; now?: Date } = $props();

	const meta = $derived(INFERENCE_PRESENTATION[inference.type]);
</script>

<div class="annotation">
	<AccentPanel accent={meta.accent} density="compact">
		<InferenceSummary {inference} mode="annotation" {now} />
	</AccentPanel>
</div>

<style>
	.annotation {
		margin-top: var(--space-2);
	}
</style>
