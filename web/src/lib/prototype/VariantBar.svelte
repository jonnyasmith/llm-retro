<script lang="ts">
	import { useVariants } from './variants.svelte';

	const store = useVariants();
</script>

{#if store.variants.length > 0}
	<div class="variant-bar" role="group" aria-label="Prototype variant switcher">
		<span class="variant-bar__label">Variant</span>
		{#each store.variants as variant (variant.id)}
			<button
				type="button"
				class="variant-bar__btn"
				class:on={store.current === variant.id}
				title={variant.description}
				onclick={() => store.select(variant.id)}
			>
				{variant.label}
			</button>
		{/each}
		{#if store.description}
			<span class="variant-bar__desc">{store.description}</span>
		{/if}
	</div>
{/if}

<style>
	.variant-bar {
		position: fixed;
		bottom: 18px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 999px;
		background: rgba(20, 24, 31, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(8px);
		font: 500 13px/1.2 system-ui, sans-serif;
		color: #e6edf3;
	}
	.variant-bar__label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: #8b98a5;
		margin-right: 2px;
	}
	.variant-bar__btn {
		border: 0;
		background: transparent;
		color: #8b98a5;
		padding: 6px 13px;
		border-radius: 999px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.variant-bar__btn:hover {
		color: #e6edf3;
	}
	.variant-bar__btn.on {
		background: #4c8dff;
		color: #fff;
	}
	.variant-bar__desc {
		max-width: 320px;
		margin-left: 6px;
		font-size: 12px;
		color: #8b98a5;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
