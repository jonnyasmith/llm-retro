<script lang="ts">
	import type { Session } from '$lib/features/viewers';
	import type { Aggregate, LatencyMode } from '$lib/features/viewers';
	import { fmtK, fmtMin } from '$lib/features/viewers';
	import { sparkOption } from '$lib/features/viewers';
	import { Chart } from '$lib/features/viewers';
	import SessionDetail from '../organisms/SessionDetail.svelte';
	import SessionRow from '../molecules/SessionRow.svelte';
	import SessionsRailSummary from '../organisms/SessionsRailSummary.svelte';
	import { MasterDetailTemplate as MasterDetail, Text } from '$lib/design-system';

	let {
		f,
		a,
		selectedId,
		latencyMode,
		onSelectSession,
		onLatencyModeChange,
		onOpenInsights
	}: {
		f: Session[];
		a: Aggregate;
		selectedId: string | null;
		latencyMode: LatencyMode;
		onSelectSession: (sessionId: string) => void;
		onLatencyModeChange: (mode: LatencyMode) => void;
		onOpenInsights: () => void;
	} = $props();

	const selected = $derived(f.find((s) => s.id === selectedId) ?? f[0] ?? null);
</script>

<MasterDetail>
	{#snippet list()}
		<SessionsRailSummary
			sessions={a.sessions}
			tokens={fmtK(a.totalTokens)}
			turns={a.turns}
			activeTime={fmtMin(Math.round(a.activeMs / 60000))}
		/>
		<div class="rows">
			{#each f as s (s.id)}
				<SessionRow
					session={{
						id: s.id,
						title: s.title,
						tool: s.tool,
						start: s.start,
						turns: s.turns,
						totalTokens: s.tokens.in + s.tokens.out,
						durationMin: s.durationMin,
						subagentCount: s.subagents.count
					}}
					selected={s.id === selected?.id}
					onselect={onSelectSession}
				>
					{#snippet sparkline()}<Chart option={sparkOption(s)} height={26} />{/snippet}
				</SessionRow>
			{/each}
		</div>
	{/snippet}
	{#snippet detail()}
		{#if selected}
			<SessionDetail session={selected} {latencyMode} {onLatencyModeChange} {onOpenInsights} />
		{:else}
			<Text tone="muted">No session in scope.</Text>
		{/if}
	{/snippet}
</MasterDetail>

<style>
	.rows {
		overflow-y: auto;
		flex: 1;
		max-height: 62vh;
	}
</style>
