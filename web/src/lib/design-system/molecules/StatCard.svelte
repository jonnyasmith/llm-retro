<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Card from './Card.svelte';
	import CardHint from '../atoms/CardHint.svelte';
	import CardTitle from '../atoms/CardTitle.svelte';
	import Kpi from '../atoms/Kpi.svelte';
	import type { KpiDelta } from '../atoms/Kpi.svelte';

	type Props = HTMLAttributes<HTMLDivElement> & {
		label: string;
		sub?: string;
		unit?: string;
		delta?: KpiDelta;
		footer?: Snippet;
		class?: string;
		children: Snippet;
	};

	let { label, sub, unit, delta, footer, class: className, children, ...rest }: Props = $props();
</script>

<Card class={className} {...rest}>
	<CardTitle>{label}</CardTitle>
	<Kpi {unit} {delta}>{@render children()}</Kpi>
	{#if sub}<CardHint>{sub}</CardHint>{/if}
	{#if footer}{@render footer()}{/if}
</Card>
