<script lang="ts">
	import type { Provenance } from './types';
	import { relTime } from './aggregate';
	import { Text } from '$lib/ui';

	let { p }: { p: Provenance } = $props();
</script>

<div class="prov" title="Provenance stamp — recompute is gated on this stamp changing (#6)">
	<Text tone="warn" class="nonauth-mini">model-derived · non-authoritative</Text>
	<Text mono tone="dim"
		>{p.model} · {p.promptVersion} · extractor v{p.extractorVersion} · ran {relTime(p.ranAt)}</Text
	>
</div>

<style>
	.prov {
		margin-top: auto;
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-top: 1px dashed var(--line);
	}
	.prov :global(.nonauth-mini) {
		font-size: 9.5px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
</style>
