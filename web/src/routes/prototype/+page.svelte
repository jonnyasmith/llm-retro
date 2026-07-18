<script lang="ts">
	// Auto-discover prototypes: every nested `<name>/+page.svelte` is a prototype.
	// No manual registry to drift out of sync.
	const modules = import.meta.glob('./*/+page.svelte');
	const prototypes = Object.keys(modules)
		.map((path) => /^\.\/([^/]+)\/\+page\.svelte$/.exec(path)?.[1])
		.filter((name): name is string => Boolean(name))
		.sort();
</script>

<main class="index">
	<h1>Prototypes</h1>
	<p class="index__lede">
		Throwaway, dev-only design experiments. Each lives at <code>/prototype/&lt;name&gt;</code> and is
		unlinked from the real app.
	</p>
	{#if prototypes.length === 0}
		<p class="index__empty">No prototypes yet.</p>
	{:else}
		<ul class="index__list">
			{#each prototypes as name (name)}
				<li><a href="/prototype/{name}">{name}</a></li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.index {
		max-width: 720px;
		margin: 0 auto;
		padding: 48px 24px;
	}
	h1 {
		margin: 0 0 8px;
		font-size: 28px;
		font-weight: 700;
	}
	.index__lede {
		color: #8b98a5;
		margin: 0 0 28px;
	}
	code {
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
		color: #4c8dff;
	}
	.index__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.index__list a {
		display: block;
		padding: 14px 16px;
		border: 1px solid #2a323d;
		border-radius: 10px;
		background: #161b22;
		color: #e6edf3;
		text-decoration: none;
		font-weight: 600;
	}
	.index__list a:hover {
		border-color: #4c8dff;
		color: #fff;
	}
	.index__empty {
		color: #5c6773;
	}
</style>
