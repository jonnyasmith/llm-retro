<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '../internal/cn';

	type Props = HTMLAnchorAttributes & {
		class?: string;
		children: Snippet;
	};

	let { class: className, children, ...rest }: Props = $props();
</script>

<a class={cn('link', className)} {...rest}>{@render children()}</a>

<style>
	.link {
		color: var(--accent);
		text-underline-offset: 0.2em;
	}

	.link:hover {
		text-decoration-thickness: 0.14em;
	}

	.link:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: var(--focus-offset);
		border-radius: var(--radius-sm);
	}
</style>
