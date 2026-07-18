<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from './utils';

	export type KpiDelta = 'none' | 'up' | 'down';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Directional colouring for a change figure. */
		delta?: KpiDelta;
		/** Small trailing unit label, e.g. "turns". */
		unit?: string;
		class?: string;
		children: Snippet;
	};

	let { delta = 'none', unit, class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('kpi', className)} data-delta={delta} {...rest}>
	{@render children()}{#if unit}<small>{unit}</small>{/if}
</div>

<style>
	.kpi {
		font-size: 30px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}
	.kpi[data-delta='up'] {
		color: var(--good);
	}
	.kpi[data-delta='down'] {
		color: var(--bad);
	}
	.kpi small {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		margin-left: 4px;
	}
</style>
