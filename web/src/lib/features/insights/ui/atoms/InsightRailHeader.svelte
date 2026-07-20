<script lang="ts">
	import type { InsightRailHeader } from '../../model/InsightPresentation.types';

	let { header }: { header: InsightRailHeader } = $props();
</script>

<div>{header.label}</div>

<style>
	div {
		padding: var(--space-3) 14px;
		border-bottom: 1px solid var(--line);
		font-size: 12px;
		color: var(--muted);
	}
</style>
