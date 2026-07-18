<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** How many parent Grid columns this cell spans. */
		span?: number;
		class?: string;
		children: Snippet;
	};

	let { span = 1, class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('col', className)} style="--span:{span}" {...rest}>
	{@render children()}
</div>

<style>
	.col {
		grid-column: span var(--span);
	}
</style>
