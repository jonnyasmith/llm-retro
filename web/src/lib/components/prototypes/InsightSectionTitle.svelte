<script lang="ts">
	import type { InsightSectionHeading } from './InsightPresentation.types';

	let { heading }: { heading: InsightSectionHeading } = $props();
</script>

<h3>
	{heading.label}{#if heading.suffix}
		<span>{heading.suffix}</span>{/if}
</h3>

<style>
	h3 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--dim);
		margin: 26px 0 var(--space-5);
	}
	span {
		font-weight: 400;
	}
</style>
