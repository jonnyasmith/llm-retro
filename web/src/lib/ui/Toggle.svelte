<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from './utils';

	export type ToggleTone = 'default' | 'claude' | 'codex' | 'pi' | 'model';

	type Props = HTMLButtonAttributes & {
		/** Whether the toggle is currently active (reflected as aria-pressed). */
		pressed: boolean;
		/** Colour identity applied when pressed. */
		tone?: ToggleTone;
		class?: string;
		children: Snippet;
	};

	let { pressed, tone = 'default', class: className, children, ...rest }: Props = $props();
</script>

<button
	type="button"
	class={cn('toggle', className)}
	data-tone={tone}
	aria-pressed={pressed}
	{...rest}
>
	{@render children()}
</button>

<style>
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border: 1px solid var(--line);
		background: var(--panel2);
		color: var(--muted);
		padding: 5px 11px;
		border-radius: var(--radius-pill);
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.toggle:focus-visible {
		outline: var(--focus-width) solid var(--focus-ring);
		outline-offset: var(--focus-offset);
	}
	.toggle[aria-pressed='true'] {
		color: var(--ink);
		border-color: transparent;
	}
	.toggle[data-tone='claude'][aria-pressed='true'] {
		background: var(--claude-tint);
		border-color: var(--claude);
	}
	.toggle[data-tone='codex'][aria-pressed='true'] {
		background: var(--codex-tint);
		border-color: var(--codex);
	}
	.toggle[data-tone='pi'][aria-pressed='true'] {
		background: var(--pi-tint);
		border-color: var(--pi);
	}
	.toggle[data-tone='model'][aria-pressed='true'] {
		background: var(--accent-tint);
		border-color: var(--accent);
	}
</style>
