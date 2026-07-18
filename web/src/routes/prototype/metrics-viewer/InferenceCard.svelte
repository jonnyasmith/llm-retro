<script lang="ts">
	import type { Inference } from './types';
	import { INFMETA } from './meta';
	import { fmtK } from './aggregate';
	import ProvenanceStamp from './ProvenanceStamp.svelte';

	let { inference }: { inference: Inference } = $props();

	const m = $derived(INFMETA[inference.type]);

	function scrollToTurn(e: Event) {
		e.preventDefault();
		document
			.getElementById('turn-' + inference.turnRef)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

<div class="infcard" style="border-left-color:{m.color}">
	<div class="row">
		<span class="itag" style="color:{m.color}">{m.icon} {m.label}</span>
		<span class="spacer" style="flex:1"></span>
		<span class="conf" title="model confidence"
			>conf {(inference.confidence * 100).toFixed(0)}%</span
		>
	</div>
	<div class="isum">{inference.summary}</div>
	{#if inference.correctedTo}
		<div class="fix">
			heard: <s>{inference.evidence}</s> &nbsp;→&nbsp; meant: <b>{inference.correctedTo}</b>
		</div>
	{:else}
		<blockquote class="ev">{inference.evidence}</blockquote>
	{/if}
	<div class="row">
		<a href="#" class="evref" data-turn={inference.turnRef} onclick={scrollToTurn}>
			→ Turn {inference.turnRef} · {inference.messageRef}
		</a>
		{#if inference.degradedAtTokens}
			<span class="spacer" style="flex:1"></span>
			<span class="dim pmono">degraded @ ~{fmtK(inference.degradedAtTokens)} ctx tokens</span>
		{/if}
	</div>
	<ProvenanceStamp p={inference.provenance} />
</div>
