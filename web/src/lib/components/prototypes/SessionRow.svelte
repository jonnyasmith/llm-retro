<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatCompact, formatMinutes } from '$lib/format';
	import { Badge, SelectableRow } from '$lib/ui';
	import type { SessionRowSummary } from './SessionRow.types';

	let {
		session,
		selected = false,
		sparkline,
		onselect
	}: {
		session: SessionRowSummary;
		selected?: boolean;
		sparkline?: Snippet;
		onselect: (id: string) => void;
	} = $props();
</script>

<SelectableRow layout="grid" {selected} onselect={() => onselect(session.id)}>
	<div>
		<div class="top">
			<Badge tone={session.tool}>{session.tool}</Badge>
			<span class="title">{session.title}</span>
		</div>
		<div class="meta">
			{session.start.toISOString().slice(0, 10)} · {session.turns} turns · {formatCompact(
				session.totalTokens
			)} tok · {formatMinutes(session.durationMin)}{session.subagentCount
				? ` · ${session.subagentCount} sub`
				: ''}
		</div>
	</div>
	{#if sparkline}
		<div class="spark">{@render sparkline()}</div>
	{/if}
</SelectableRow>

<style>
	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.title {
		font-weight: 600;
		font-size: 13px;
	}
	.meta {
		font-size: 11.5px;
		color: var(--dim);
	}
	.spark {
		width: 90px;
		height: 26px;
	}
</style>
