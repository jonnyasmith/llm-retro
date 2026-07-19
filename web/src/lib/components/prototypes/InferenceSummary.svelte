<script lang="ts">
	import { formatCompact } from '$lib/format';
	import { Row, Spacer, Text } from '$lib/ui';
	import { INFERENCE_PRESENTATION } from './Inference.presentation';
	import type { Inference } from './Inference.types';
	import ProvenanceStamp from './ProvenanceStamp.svelte';

	let { inference, mode, now }: { inference: Inference; mode: 'card' | 'annotation'; now?: Date } =
		$props();

	const meta = $derived(INFERENCE_PRESENTATION[inference.type]);
	const degradedAt = $derived(
		inference.degradedAtTokens === undefined ? null : formatCompact(inference.degradedAtTokens)
	);
</script>

<Row>
	<span class="tag">{meta.icon} {meta.label}</span>
	<Spacer />
	<span class="confidence" title="model confidence">
		conf {(inference.confidence * 100).toFixed(0)}%
	</span>
</Row>
<div class="summary">{inference.summary}</div>
{#if inference.correctedTo}
	<div class="correction">
		{#if mode === 'card'}
			heard: <s>{inference.evidence}</s> &nbsp;→&nbsp; meant: <b>{inference.correctedTo}</b>
		{:else}
			heard <s>{inference.evidence}</s> → meant <b>{inference.correctedTo}</b>
		{/if}
	</div>
{:else if mode === 'card'}
	<blockquote>{inference.evidence}</blockquote>
{/if}
{#if mode === 'annotation'}
	{#if degradedAt}
		<div class="degraded">
			<Text tone="dim" mono>degraded @ ~{degradedAt} ctx tokens</Text>
		</div>
	{/if}
	<ProvenanceStamp provenance={inference.provenance} {now} />
{/if}

<style>
	.tag {
		color: var(--accent-panel);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.summary {
		margin: var(--space-1) 0 var(--space-3);
		font-size: 13.5px;
		color: var(--ink);
	}
	blockquote {
		margin: 0 0 var(--space-3);
		padding: 7px var(--space-5);
		border-left: 2px solid var(--line);
		background: var(--panel2);
		color: var(--muted);
		font-size: 12.5px;
		font-style: italic;
		border-radius: 0 6px 6px 0;
	}
	.correction {
		margin: 0 0 var(--space-3);
		font-size: 12.5px;
		color: var(--muted);
	}
	.correction s {
		color: var(--dim);
	}
	.confidence {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--dim);
	}
	.degraded {
		display: block;
	}
</style>
