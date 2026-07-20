<script lang="ts">
	import { Link } from '$lib/design-system';

	let { healthHref }: { healthHref: string } = $props();
</script>

<main class="page">
	<h1>LLM Retro</h1>
	<p>The control plane is running.</p>
	<p><Link href={healthHref}>Check database connectivity</Link></p>
</main>

<style>
	.page {
		max-width: 52rem;
		margin-inline: auto;
		padding: var(--space-7);
		color: var(--ink);
		font-family: var(--sans);
	}
</style>
