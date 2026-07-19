<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Card from './Card.svelte';
	import CardTitle from './CardTitle.svelte';
	import Row from './Row.svelte';
	import Spacer from './Spacer.svelte';

	type Props = HTMLAttributes<HTMLDivElement> & {
		title: string;
		headerControls?: Snippet;
		class?: string;
		children: Snippet;
	};

	let { title, headerControls, class: className, children, ...rest }: Props = $props();
</script>

<Card class={className} {...rest}>
	<Row>
		<CardTitle>{title}</CardTitle>
		{#if headerControls}
			<Spacer />
			{@render headerControls()}
		{/if}
	</Row>
	{@render children()}
</Card>
