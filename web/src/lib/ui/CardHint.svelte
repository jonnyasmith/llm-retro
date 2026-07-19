<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	type Props = HTMLAttributes<HTMLDivElement> & {
		italic?: boolean;
		class?: string;
		children: Snippet;
	};

	let { italic = false, class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('card-hint', className)} data-italic={italic} {...rest}>
	{@render children()}
</div>

<style>
	.card-hint {
		font-size: 11.5px;
		color: var(--dim);
	}
	.card-hint[data-italic='true'] {
		font-style: italic;
	}
</style>
