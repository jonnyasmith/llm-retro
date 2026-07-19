<script lang="ts">
	import { AccentPanel } from '$lib/ui';
	import { INFERENCE_PRESENTATION } from './Inference.presentation';
	import type { Inference } from './Inference.types';
	import InferenceSummary from './InferenceSummary.svelte';

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
