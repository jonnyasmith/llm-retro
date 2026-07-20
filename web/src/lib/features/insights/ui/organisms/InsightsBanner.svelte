<script lang="ts">
	import { Banner, Spacer, Text } from '$lib/design-system';
	import type { InferenceType } from '../../model/Inference.types';

	let {
		sessionCount,
		extractorVersion,
		total,
		byType
	}: {
		sessionCount: number;
		extractorVersion: string;
		total: number;
		byType: Record<InferenceType, number>;
	} = $props();
</script>

<Banner tone="warn">
	<span class="lead"><Text tone="warn">⚠ Model-derived · non-authoritative</Text></span>
	<Text tone="dim">
		The LLM pass over the same {sessionCount} filtered sessions — Signals remain the source of truth.
		Extractor v{extractorVersion}.
	</Text>
	<Spacer />
	<Text tone="dim" mono>
		{total} inferences · ⤺{byType['course-correction']} ⌇{byType['input-noise']} ▽{byType[
			'dumb-zone'
		]}
	</Text>
</Banner>

<style>
	.lead :global(.text) {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
</style>
