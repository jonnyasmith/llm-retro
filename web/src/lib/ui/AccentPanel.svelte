<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	export type AccentToken = `--${string}`;

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
		/** The CSS custom-property name that supplies the panel accent colour. */
		accent: AccentToken;
		class?: string;
		style?: string;
		children: Snippet;
	};

	let { accent, class: className, style, children, ...rest }: Props = $props();
</script>

<div
	class={cn('accent-panel', className)}
	data-accent={accent}
	style={`--accent-panel: var(${accent});${style ?? ''}`}
	{...rest}
>
	{@render children()}
</div>

<style>
	.accent-panel {
		border: 1px solid var(--line);
		border-left: 3px solid var(--accent-panel);
		border-radius: 0 8px 8px 0;
		background: var(--panel);
		padding: var(--space-5) 14px;
	}
</style>
