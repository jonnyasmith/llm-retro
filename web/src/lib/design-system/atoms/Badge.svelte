<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../internal/cn';

	export type BadgeTone = 'neutral' | 'claude' | 'codex' | 'pi';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		tone?: BadgeTone;
		class?: string;
		children: Snippet;
	};

	let { tone = 'neutral', class: className, children, ...rest }: Props = $props();
</script>

<span class={cn('badge', className)} data-tone={tone} {...rest}>
	{@render children()}
</span>

<style>
	.badge {
		display: inline-block;
		font-size: 11px;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: var(--radius-sm);
	}
	.badge[data-tone='neutral'] {
		background: var(--panel2);
		color: var(--muted);
	}
	.badge[data-tone='claude'] {
		background: var(--claude-tint);
		color: var(--claude-text);
	}
	.badge[data-tone='codex'] {
		background: var(--codex-tint);
		color: var(--codex-text);
	}
	.badge[data-tone='pi'] {
		background: var(--pi-tint);
		color: var(--pi-text);
	}
</style>
