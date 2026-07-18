<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	export type TextTone = 'default' | 'muted' | 'dim' | 'warn';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		tone?: TextTone;
		/** Monospace, 11px — the recurring metadata/provenance treatment. */
		mono?: boolean;
		class?: string;
		children: Snippet;
	};

	let { tone = 'default', mono = false, class: className, children, ...rest }: Props = $props();
</script>

<span class={cn('text', className)} data-tone={tone} data-mono={mono} {...rest}>
	{@render children()}
</span>

<style>
	.text[data-tone='muted'] {
		color: var(--muted);
	}
	.text[data-tone='dim'] {
		color: var(--dim);
	}
	.text[data-tone='warn'] {
		color: var(--warn);
	}
	.text[data-mono='true'] {
		font-family: var(--mono);
		font-size: 11px;
	}
</style>
