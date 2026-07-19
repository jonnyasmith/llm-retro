<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Card from './Card.svelte';
	import CardTitle from './CardTitle.svelte';
	import type { CardTitleTransform } from './CardTitle.svelte';
	import Row from './Row.svelte';
	import Spacer from './Spacer.svelte';

	type Props = HTMLAttributes<HTMLDivElement> & {
		title?: string;
		titleTransform?: CardTitleTransform;
		headerControls?: Snippet;
		class?: string;
		children: Snippet;
	};

	let {
		title,
		titleTransform,
		headerControls,
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<Card class={className} {...rest}>
	{#if title || headerControls}
		<Row>
			{#if title}<CardTitle transform={titleTransform}>{title}</CardTitle>{/if}
			{#if headerControls}
				<Spacer />
				{@render headerControls()}
			{/if}
		</Row>
	{/if}
	{@render children()}
</Card>
