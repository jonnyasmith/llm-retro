<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Left rail: aggregates, list header, selectable rows. */
		list: Snippet;
		/** Right pane: detail for the current selection. */
		detail: Snippet;
	};

	let { list, detail }: Props = $props();
</script>

<div class="md">
	<div class="md-list">{@render list()}</div>
	<div class="md-detail">{@render detail()}</div>
</div>

<style>
	.md {
		display: grid;
		grid-template-columns: 380px 1fr;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
		min-height: 70vh;
	}
	.md-list {
		border-right: 1px solid var(--line);
		background: var(--panel);
		display: flex;
		flex-direction: column;
	}
	.md-detail {
		padding: var(--space-7);
		overflow-y: auto;
		max-height: 70vh;
	}
	@media (max-width: 700px) {
		.md {
			grid-template-columns: minmax(0, 1fr);
			min-height: 0;
		}
		.md-list {
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.md-detail {
			max-height: none;
			padding: var(--space-5);
		}
	}
</style>
