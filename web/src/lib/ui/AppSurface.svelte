<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	type Props = HTMLAttributes<HTMLDivElement> & {
		class?: string;
		children: Snippet;
	};

	let { class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('app-surface', className)} {...rest}>
	{@render children()}
</div>

<style>
	.app-surface {
		color: var(--ink);
		font-family: var(--sans);
		background: var(--bg);
	}
</style>
