<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Card from './Card.svelte';
	import CardHint from './CardHint.svelte';
	import CardTitle from './CardTitle.svelte';
	import Kpi from './Kpi.svelte';

	type Props = HTMLAttributes<HTMLDivElement> & {
		label: string;
		sub?: string;
		unit?: string;
		class?: string;
		children: Snippet;
	};

	let { label, sub, unit, class: className, children, ...rest }: Props = $props();
</script>

<Card class={className} {...rest}>
	<CardTitle>{label}</CardTitle>
	<Kpi {unit}>{@render children()}</Kpi>
	{#if sub}<CardHint>{sub}</CardHint>{/if}
</Card>
