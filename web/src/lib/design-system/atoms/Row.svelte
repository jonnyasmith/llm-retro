<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../internal/cn';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Cross-axis alignment. */
		align?: 'center' | 'start' | 'end' | 'baseline';
		class?: string;
		children: Snippet;
	};

	let { align = 'center', class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('row', className)} data-align={align} {...rest}>
	{@render children()}
</div>

<style>
	.row {
		display: flex;
		gap: var(--space-3);
	}
	.row[data-align='center'] {
		align-items: center;
	}
	.row[data-align='start'] {
		align-items: flex-start;
	}
	.row[data-align='end'] {
		align-items: flex-end;
	}
	.row[data-align='baseline'] {
		align-items: baseline;
	}
</style>
