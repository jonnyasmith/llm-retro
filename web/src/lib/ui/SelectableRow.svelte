<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { clickable } from '$lib/actions/clickable';
	import { cn } from './utils';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Highlighted as the active selection. */
		selected?: boolean;
		onselect: () => void;
		/** `grid` = two-column (content + trailing); `block` = stacked. */
		layout?: 'block' | 'grid';
		class?: string;
		children: Snippet;
	};

	let {
		selected = false,
		onselect,
		layout = 'block',
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<div
	class={cn('srow', className)}
	data-layout={layout}
	data-selected={selected}
	use:clickable={onselect}
	{...rest}
>
	{@render children()}
</div>

<style>
	.srow {
		padding: var(--space-4) var(--space-6);
		border-bottom: 1px solid var(--line);
		cursor: pointer;
	}
	.srow[data-layout='grid'] {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-1);
		align-items: center;
	}
	.srow[data-layout='block'] {
		display: block;
	}
	.srow:hover {
		background: var(--panel2);
	}
	.srow:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: calc(-1 * var(--focus-width));
	}
	.srow[data-selected='true'] {
		background: var(--accent-tint);
		box-shadow: inset 3px 0 0 var(--accent);
	}
</style>
