<script lang="ts">
	import { Chip, Row, Spacer, Text } from '$lib/design-system';

	let {
		title,
		synthesis,
		sessionIds,
		onJump
	}: {
		title: string;
		synthesis: string;
		sessionIds: string[];
		onJump: (sessionId: string) => void;
	} = $props();
</script>

<div class="theme-card">
	<Row>
		<b>{title}</b>
		<Spacer />
		<Text tone="dim" mono>{sessionIds.length} sessions</Text>
	</Row>
	<div>{synthesis}</div>
	<div class="chips">
		{#each sessionIds.slice(0, 10) as sessionId (sessionId)}
			<Chip data-jump={sessionId} onclick={() => onJump(sessionId)}>{sessionId}</Chip>
		{/each}
		{#if sessionIds.length > 10}
			<Chip variant="more">+{sessionIds.length - 10}</Chip>
		{/if}
	</div>
</div>

<style>
	.theme-card {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--panel);
		padding: var(--space-5) 14px;
	}
	.theme-card b {
		color: var(--ink);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin: var(--space-4) 0;
	}
</style>
