<script lang="ts">
	type Health = { status: string; database: string };

	let { health }: { health: Health } = $props();

	const connected = $derived(health.database === 'connected');
</script>

<main class="page">
	<h1>LLM Retro</h1>
	<p>The control plane is running.</p>
	<p class="status" data-connected={connected}>
		Database: {connected ? 'connected' : 'disconnected'} ({health.status})
	</p>
</main>

<style>
	.page {
		max-width: 52rem;
		margin-inline: auto;
		padding: var(--space-7);
		color: var(--ink);
		font-family: var(--sans);
	}

	.status[data-connected='false'] {
		color: var(--bad);
	}
</style>
