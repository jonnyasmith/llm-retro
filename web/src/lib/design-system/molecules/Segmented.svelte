<script module lang="ts">
	export type SegmentedVariant = 'inset' | 'outline';
</script>

<script lang="ts" generics="T extends string | number">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../internal/cn';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onchange'> & {
		options: ReadonlyArray<{ value: T; label: string }>;
		value: T;
		onchange: (value: T) => void;
		variant?: SegmentedVariant;
		/** Accessible group label. */
		label: string;
		class?: string;
	};

	let {
		options,
		value,
		onchange,
		variant = 'inset',
		label,
		class: className,
		...rest
	}: Props = $props();
</script>

<div class={cn('seg', className)} data-variant={variant} role="group" aria-label={label} {...rest}>
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="seg-btn"
			aria-pressed={opt.value === value}
			onclick={() => onchange(opt.value)}
		>
			{opt.label}
		</button>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		max-width: 100%;
	}
	.seg-btn {
		font-family: inherit;
		font-weight: 600;
		cursor: pointer;
		color: var(--muted);
	}
	.seg-btn:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: -1px;
	}

	/* ---- inset: one recessed track, active segment filled ---- */
	.seg[data-variant='inset'] {
		background: var(--panel2);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 3px;
		gap: 4px;
		overflow: hidden;
	}
	.seg[data-variant='inset'] .seg-btn {
		border: 0;
		background: transparent;
		padding: 5px 12px;
		font-size: 12px;
		border-radius: var(--radius-sm);
	}
	.seg[data-variant='inset'] .seg-btn:not([aria-pressed='true']):hover {
		color: var(--ink);
	}
	.seg[data-variant='inset'] .seg-btn[aria-pressed='true'] {
		background: var(--accent-solid);
		color: var(--on-accent);
	}

	/* ---- outline: individually bordered boxes ---- */
	.seg[data-variant='outline'] {
		gap: 4px;
	}
	.seg[data-variant='outline'] .seg-btn {
		background: var(--panel2);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		padding: 5px 10px;
		font-size: 12.5px;
	}
	.seg[data-variant='outline'] .seg-btn[aria-pressed='true'] {
		background: var(--accent-solid);
		color: var(--on-accent);
	}
	.seg[data-variant='outline'] {
		overflow-x: auto;
	}
</style>
