<script lang="ts">
	import { Text } from '$lib/design-system';
	import type { Inference } from '../../model/Inference.types';
	import Annotation from '../molecules/Annotation.svelte';

	let {
		inference,
		model,
		gap,
		now
	}: { inference: Inference; model: string; gap: number; now?: Date } = $props();
</script>

{#if gap > 0}
	<div class="gap">⋯ {gap} turn{gap > 1 ? 's' : ''} without a flag</div>
{/if}
<div class="turn" id="turn-{inference.turnRef}">
	<div class="number">
		Turn {inference.turnRef}
		<div class="reference">{inference.messageRef}</div>
	</div>
	<div class="body">
		<div class="message user"><span class="who">you</span> {inference.evidence}</div>
		<div class="message ai">
			<span class="who">{model}</span>
			<Text tone="dim">…the response you then redirected…</Text>
		</div>
		<Annotation {inference} {now} />
	</div>
</div>

<style>
	.gap {
		color: var(--dim);
		font-size: 11.5px;
		font-style: italic;
		margin: var(--space-2) 0 var(--space-2) 76px;
	}
	.turn {
		display: grid;
		grid-template-columns: 72px 1fr;
		gap: var(--space-5);
		margin-bottom: 14px;
		scroll-margin-top: 130px;
	}
	.number {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
		text-align: right;
		padding-top: var(--space-2);
	}
	.reference {
		color: var(--dim);
		font-weight: 400;
		font-size: 10px;
		margin-top: 2px;
		font-family: var(--mono);
	}
	.body {
		min-width: 0;
	}
	.message {
		font-size: 12.5px;
		padding: var(--space-2) var(--space-4);
		border-radius: 8px;
		margin-bottom: 5px;
	}
	.message.user {
		background: var(--panel2);
		color: var(--ink);
	}
	.message.ai {
		background: transparent;
		border: 1px dashed var(--line);
	}
	.who {
		font-family: var(--mono);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--dim);
		margin-right: var(--space-2);
	}
</style>
