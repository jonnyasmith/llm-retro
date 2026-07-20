<script lang="ts">
	import { formatCompact } from '$lib/format';
	import { AccentPanel, Button, Row, Spacer, Text } from '$lib/design-system';
	import { INFERENCE_PRESENTATION } from '../../model/Inference.presentation';
	import type { Inference } from '../../model/Inference.types';
	import InferenceSummary from '../molecules/InferenceSummary.svelte';
	import ProvenanceStamp from '../molecules/ProvenanceStamp.svelte';

	let {
		inference,
		now,
		embedded = false,
		embeddedAfterFirst = false,
		onTurnClick
	}: {
		inference: Inference;
		now?: Date;
		embedded?: boolean;
		embeddedAfterFirst?: boolean;
		onTurnClick: (turnRef: number) => void;
	} = $props();

	const meta = $derived(INFERENCE_PRESENTATION[inference.type]);
	const degradedAt = $derived(
		inference.degradedAtTokens === undefined ? null : formatCompact(inference.degradedAtTokens)
	);
</script>

<div class="card" data-embedded={embedded} data-after-first={embeddedAfterFirst}>
	<AccentPanel accent={meta.accent} surface={embedded ? 'secondary' : 'primary'}>
		<InferenceSummary {inference} mode="card" {now} />
		<Row>
			<span class="turn-link">
				<Button
					variant="link"
					data-turn={inference.turnRef}
					onclick={() => onTurnClick(inference.turnRef)}
				>
					→ Turn {inference.turnRef} · {inference.messageRef}
				</Button>
			</span>
			{#if degradedAt}
				<Spacer />
				<Text tone="dim" mono>degraded @ ~{degradedAt} ctx tokens</Text>
			{/if}
		</Row>
		<ProvenanceStamp provenance={inference.provenance} {now} />
	</AccentPanel>
</div>

<style>
	.card {
		margin-bottom: var(--space-5);
	}
	.card[data-embedded='true'] {
		margin-top: var(--space-4);
		margin-bottom: 0;
	}
	.card[data-after-first='true'] {
		margin-top: var(--space-3);
	}
	.turn-link :global(.btn) {
		font-family: var(--mono);
		font-size: 11.5px;
	}
</style>
