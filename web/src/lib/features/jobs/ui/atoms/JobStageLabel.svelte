<script lang="ts">
	import { Text } from '$lib/design-system';
	import type { JobStage } from '../../model/types';

	let { stage }: { stage: JobStage } = $props();
</script>

<div class="label"><Text tone="dim">{stage}</Text></div>

<style>
	.label {
		margin-bottom: var(--space-3);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}
</style>
