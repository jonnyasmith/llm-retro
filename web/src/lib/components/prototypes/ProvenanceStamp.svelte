<script lang="ts">
	import { Text } from '$lib/ui';
	import type { Provenance } from './Inference.types';

	let { provenance, now = provenance.ranAt }: { provenance: Provenance; now?: Date } = $props();

	const ranAt = $derived.by(() => {
		const hours = Math.round((now.getTime() - provenance.ranAt.getTime()) / 3_600_000);
		return hours < 1 ? 'just now' : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
	});
</script>

<div class="provenance" title="Provenance stamp — recompute is gated on this stamp changing (#6)">
	<Text tone="warn" class="nonauth-mini">model-derived · non-authoritative</Text>
	<Text mono tone="dim">
		{provenance.model} · {provenance.promptVersion} · extractor v{provenance.extractorVersion} · ran
		{ranAt}
	</Text>
</div>

<style>
	.provenance {
		margin-top: auto;
		padding-top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-top: 1px dashed var(--line);
	}
	.provenance :global(.nonauth-mini) {
		font-size: 9.5px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
</style>
