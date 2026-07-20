<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		heading,
		description,
		children
	}: {
		id: string;
		heading: string;
		description: Snippet;
		children: Snippet;
	} = $props();
</script>

<section {id}>
	<h2>{heading}</h2>
	<div class="description">{@render description()}</div>
	{@render children()}
</section>

<style>
	section {
		margin-bottom: 44px;
		scroll-margin-top: 130px;
	}
	h2 {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.3px;
		margin: 0 0 var(--space-1);
	}
	.description {
		color: var(--muted);
		margin-bottom: var(--space-6);
		max-width: 720px;
	}
</style>
