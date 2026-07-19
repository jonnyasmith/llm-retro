<script lang="ts">
	import type { TokenBasis } from './Session.types';

	let { basis }: { basis: TokenBasis } = $props();
</script>

{#if basis === 'reconstructed'}
	<span class="reconstructed" title="Reconstructed by diffing — not exact">reconstructed</span>
{:else}
	exact
{/if}

<style>
	.reconstructed {
		color: var(--warn);
		border-bottom: 1px dashed var(--warn);
		cursor: help;
	}
</style>
