<script lang="ts">
	import type { Provenance } from './types';
	import { relTime } from './aggregate';

	let { p }: { p: Provenance } = $props();
</script>

<div class="prov" title="Provenance stamp — recompute is gated on this stamp changing (#6)">
	<span class="nonauth">model-derived · non-authoritative</span>
	<span class="pmono"
		>{p.model} · {p.promptVersion} · extractor v{p.extractorVersion} · ran {relTime(p.ranAt)}</span
	>
</div>
