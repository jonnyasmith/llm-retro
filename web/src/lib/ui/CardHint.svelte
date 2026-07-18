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

<div class={cn('card-hint', className)} {...rest}>
	{@render children()}
</div>

<style>
	.card-hint {
		font-size: 11.5px;
		color: var(--dim);
	}
</style>
