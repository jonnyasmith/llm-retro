<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../internal/cn';

	type Props = HTMLAttributes<HTMLDivElement> & {
		class?: string;
		children: Snippet;
	};

	let { class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('card', className)} {...rest}>
	{@render children()}
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-6);
	}
</style>
