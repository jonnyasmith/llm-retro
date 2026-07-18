<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Lead-in label rendered in accent caps, e.g. "Reads as →". */
		label: string;
		class?: string;
		children: Snippet;
	};

	let { label, class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('verdict', className)} {...rest}>
	<span class="lbl">{label}</span>
	{@render children()}
</div>

<style>
	.verdict {
		border-left: 3px solid var(--accent);
		background: var(--panel);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		padding: var(--space-5) var(--space-6);
		margin-top: var(--space-6);
	}
	.lbl {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--accent);
		font-weight: 700;
		margin-right: var(--space-2);
	}
</style>
