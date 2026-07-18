<script lang="ts">
	import type { Inference } from './types';
	import { INFMETA } from './meta';
	import { fmtK } from './aggregate';
	import { Row, Spacer, Text, Button } from '$lib/ui';
	import ProvenanceStamp from './ProvenanceStamp.svelte';

	let { inference }: { inference: Inference } = $props();

	const m = $derived(INFMETA[inference.type]);

	function scrollToTurn() {
		document
			.getElementById('turn-' + inference.turnRef)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

<div class="infcard" style="border-left-color:{m.color}">
	<Row>
		<span class="itag" style="color:{m.color}">{m.icon} {m.label}</span>
		<Spacer />
		<span class="conf" title="model confidence"
			>conf {(inference.confidence * 100).toFixed(0)}%</span
		>
	</Row>
	<div class="isum">{inference.summary}</div>
	{#if inference.correctedTo}
		<div class="fix">
			heard: <s>{inference.evidence}</s> &nbsp;→&nbsp; meant: <b>{inference.correctedTo}</b>
		</div>
	{:else}
		<blockquote class="ev">{inference.evidence}</blockquote>
	{/if}
	<Row>
		<Button
			variant="link"
			data-turn={inference.turnRef}
			onclick={scrollToTurn}
			style="font-family:var(--mono);font-size:11.5px"
		>
			→ Turn {inference.turnRef} · {inference.messageRef}
		</Button>
		{#if inference.degradedAtTokens}
			<Spacer />
			<Text tone="dim" mono>degraded @ ~{fmtK(inference.degradedAtTokens)} ctx tokens</Text>
		{/if}
	</Row>
	<ProvenanceStamp p={inference.provenance} />
</div>

<style>
	.infcard {
		border: 1px solid var(--line);
		border-left: 3px solid var(--accent);
		border-radius: 0 8px 8px 0;
		background: var(--panel);
		padding: 12px 14px;
		margin-bottom: 12px;
	}
	.itag {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.isum {
		margin: 4px 0 8px;
		font-size: 13.5px;
		color: var(--ink);
	}
	.ev {
		margin: 0 0 8px;
		padding: 7px 12px;
		border-left: 2px solid var(--line);
		background: var(--panel2);
		color: var(--muted);
		font-size: 12.5px;
		font-style: italic;
		border-radius: 0 6px 6px 0;
	}
	.fix {
		margin: 0 0 8px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.fix s {
		color: var(--dim);
	}
	.conf {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--dim);
	}
</style>
