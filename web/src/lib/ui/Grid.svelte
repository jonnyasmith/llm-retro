<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Number of equal columns the track is divided into. */
		cols?: number;
		class?: string;
		children: Snippet;
	};

	let { cols = 6, class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('grid', className)} style="--cols:{cols}" {...rest}>
	{@render children()}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: 14px;
	}
</style>
