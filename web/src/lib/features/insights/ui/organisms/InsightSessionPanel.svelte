<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, Row, Spacer, Text } from '$lib/design-system';
	import type { InsightSessionEvidence } from '../../model/InsightPresentation.types';

	let {
		session,
		onMetrics,
		children
	}: {
		session: InsightSessionEvidence;
		onMetrics: (sessionId: string) => void;
		children?: Snippet;
	} = $props();
</script>

<div class="session-panel">
	<Row>
		<b>{session.title}</b>
		<Text tone="dim"
			>{session.id}{#if session.tool}
				· {session.tool}{/if}</Text
		>
		<Spacer />
		{#if session.degradedAt}<Text tone="dim" mono>{session.degradedAt}</Text>{/if}
		<Button variant="link" data-tometrics={session.id} onclick={() => onMetrics(session.id)}
			>metrics →</Button
		>
	</Row>
	{#if children}{@render children()}{/if}
</div>

<style>
	.session-panel {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--panel);
		padding: var(--space-5) 14px;
		margin-bottom: var(--space-5);
	}
	.session-panel :global(b) {
		color: var(--ink);
	}
</style>
