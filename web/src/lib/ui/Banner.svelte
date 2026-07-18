<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	type Props = HTMLAttributes<HTMLDivElement> & {
		tone?: 'warn' | 'info';
		class?: string;
		children: Snippet;
	};

	let { tone = 'info', class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('banner', className)} data-tone={tone} {...rest}>
	{@render children()}
</div>

<style>
	.banner {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		padding: 9px var(--space-6);
		border-radius: var(--radius-sm);
	}
	.banner[data-tone='warn'] {
		background: var(--warn-tint);
		border: 1px solid var(--warn-line);
	}
	.banner[data-tone='info'] {
		background: var(--panel);
		border: 1px solid var(--line);
	}
</style>
