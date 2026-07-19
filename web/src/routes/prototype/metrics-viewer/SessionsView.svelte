<script lang="ts">
	import type { Session } from './types';
	import type { Aggregate } from './aggregate';
	import { fmtK, fmtMin } from './aggregate';
	import { sparkOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import Chart from './Chart.svelte';
	import SessionDetail from './SessionDetail.svelte';
	import SessionRow from '$lib/components/prototypes/SessionRow.svelte';
	import SessionsRailSummary from '$lib/components/prototypes/SessionsRailSummary.svelte';
	import { MasterDetail, Text } from '$lib/ui';

	let { f, a }: { f: Session[]; a: Aggregate } = $props();

	const st = useViewerState();

	// Keep the selection inside the current filtered scope; default to the first.
	$effect(() => {
		if (!f.some((s) => s.id === st.selected)) {
			st.selected = f[0]?.id ?? null;
		}
	});

	const selected = $derived(f.find((s) => s.id === st.selected) ?? null);
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
					selected={s.id === st.selected}
					onselect={(id) => (st.selected = id)}
				>
					{#snippet sparkline()}<Chart option={sparkOption(s)} height={26} />{/snippet}
				</SessionRow>
			{/each}
		</div>
	{/snippet}
	{#snippet detail()}
		{#if selected}
			<SessionDetail session={selected} />
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
