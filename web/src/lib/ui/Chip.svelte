<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'onclick'> & {
		/** When set the chip is an interactive button; otherwise a static span. */
		onclick?: () => void;
		/** `more` renders a muted, non-interactive overflow indicator. */
		variant?: 'default' | 'more';
		class?: string;
		children: Snippet;
	};

	let { onclick, variant = 'default', class: className, children, ...rest }: Props = $props();
</script>

{#if onclick}
	<button type="button" class={cn('chip', className)} data-variant={variant} {onclick} {...rest}>
		{@render children()}
	</button>
{:else}
	<span class={cn('chip', className)} data-variant={variant} {...rest}>
		{@render children()}
	</span>
{/if}

<style>
	.chip {
		display: inline-block;
		font-family: var(--mono);
		font-size: 11px;
		padding: 2px 7px;
		border-radius: var(--radius-sm);
		background: var(--panel2);
		border: 1px solid var(--line);
		color: var(--muted);
	}
	button.chip {
		cursor: pointer;
	}
	button.chip:hover {
		border-color: var(--accent);
		color: var(--ink);
	}
	button.chip:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: var(--focus-offset);
	}
	.chip[data-variant='more'] {
		opacity: 0.6;
	}
</style>
