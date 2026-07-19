<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	export type CardTitleTransform = 'uppercase' | 'none';

	type Props = HTMLAttributes<HTMLHeadingElement> & {
		transform?: CardTitleTransform;
		class?: string;
		children: Snippet;
	};

	let { transform = 'uppercase', class: className, children, ...rest }: Props = $props();
</script>

<h3 class={cn('card-title', className)} data-transform={transform} {...rest}>
	{@render children()}
</h3>

<style>
	.card-title {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		letter-spacing: 0.5px;
	}
	.card-title[data-transform='uppercase'] {
		text-transform: uppercase;
	}
</style>
