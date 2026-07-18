<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from './utils';

	export type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'link' | 'pill';
	export type ButtonSize = 'sm' | 'md';

	type Props = HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Extra class(es) merged after the base class — the override hook. */
		class?: string;
		children: Snippet;
	};

	let {
		variant = 'solid',
		size = 'md',
		type = 'button',
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<button {type} class={cn('btn', className)} data-variant={variant} data-size={size} {...rest}>
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: var(--focus-offset);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ---- sizes ---- */
	.btn[data-size='sm'] {
		padding: 5px 10px;
		font-size: 12px;
	}
	.btn[data-size='md'] {
		padding: 6px 14px;
		font-size: 13px;
	}

	/* ---- variants ---- */
	.btn[data-variant='solid'] {
		background: var(--accent);
		color: #fff;
	}
	.btn[data-variant='outline'] {
		background: var(--panel2);
		color: var(--ink);
		border-color: var(--line);
	}
	.btn[data-variant='ghost'] {
		background: transparent;
		color: var(--muted);
	}
	.btn[data-variant='ghost']:hover {
		color: var(--ink);
	}
	.btn[data-variant='link'] {
		padding: 0;
		background: transparent;
		color: var(--accent);
		border: 0;
		border-radius: 0;
	}
	.btn[data-variant='link']:hover {
		text-decoration: underline;
	}
	.btn[data-variant='pill'] {
		background: var(--panel2);
		color: var(--ink);
		border-color: var(--line);
		border-radius: var(--radius-pill);
	}
	.btn[data-variant='pill']:hover {
		border-color: var(--accent);
	}
</style>
