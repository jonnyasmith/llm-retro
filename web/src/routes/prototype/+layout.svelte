<script lang="ts">
	import VariantBar from '$lib/prototype/VariantBar.svelte';
	import { provideVariants } from '$lib/prototype/variants.svelte';

	// One shared variant store for the whole subtree: prototypes register their
	// variants, the bar below renders them. Reset the store on every navigation
	// so a screen with no variants shows no bar.
	provideVariants();

	let { children } = $props();
</script>

<div class="prototype-root">
	<div class="prototype-banner" role="note">
		PROTOTYPE &mdash; throwaway, dev-only. Not the real app.
	</div>
	<div class="prototype-body">
		{@render children()}
	</div>
	<VariantBar />
</div>

<style>
	/* Reset any main-app chrome/styling so prototypes start from a clean slate.
	   Shared building blocks come from $lib, not from inherited app layout. */
	.prototype-root {
		min-height: 100vh;
		margin: 0;
		background: #0e1116;
		color: #e6edf3;
		font-family: system-ui, sans-serif;
	}
	.prototype-banner {
		position: sticky;
		top: 0;
		z-index: 900;
		padding: 5px 14px;
		font: 700 11px/1.4 ui-monospace, monospace;
		letter-spacing: 0.5px;
		text-align: center;
		color: #0e1116;
		background: repeating-linear-gradient(
			45deg,
			#d29922,
			#d29922 12px,
			#e0aa38 12px,
			#e0aa38 24px
		);
	}
	.prototype-body {
		min-height: calc(100vh - 26px);
	}
</style>
