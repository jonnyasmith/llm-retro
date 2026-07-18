<script lang="ts">
	import type { Session } from './types';
	import type { Aggregate } from './aggregate';
	import { fmtK, fmtMin } from './aggregate';
	import { sparkOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import Chart from './Chart.svelte';
	import SessionDetail from './SessionDetail.svelte';
	import { MasterDetail, SelectableRow, Badge, Spacer, Text } from '$lib/ui';

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
		<div class="agg">
			<div>
				<div class="k">Sessions</div>
				<div class="v">{a.sessions}</div>
			</div>
			<div>
				<div class="k">Tokens</div>
				<div class="v">{fmtK(a.totalTokens)}</div>
			</div>
			<div>
				<div class="k">Turns</div>
				<div class="v">{a.turns}</div>
			</div>
			<div>
				<div class="k">Active time</div>
				<div class="v">{fmtMin(Math.round(a.activeMs / 60000))}</div>
			</div>
		</div>
		<div class="listhead">
			<span>Session</span><Spacer /><span>latency</span>
		</div>
		<div class="rows">
			{#each f as s (s.id)}
				<SelectableRow
					layout="grid"
					selected={s.id === st.selected}
					onselect={() => (st.selected = s.id)}
				>
					<div>
						<div class="top">
							<Badge tone={s.tool}>{s.tool}</Badge>
							<span class="title">{s.title}</span>
						</div>
						<div class="meta">
							{s.start.toISOString().slice(0, 10)} · {s.turns} turns · {fmtK(
								s.tokens.in + s.tokens.out
							)} tok · {fmtMin(s.durationMin)}{s.subagents.count
								? ` · ${s.subagents.count} sub`
								: ''}
						</div>
					</div>
					<div class="spark"><Chart option={sparkOption(s)} height={26} /></div>
				</SelectableRow>
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
	.agg {
		padding: var(--space-5) var(--space-6);
		border-bottom: 1px solid var(--line);
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3) var(--space-6);
	}
	.k {
		font-size: 11px;
		color: var(--dim);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.v {
		font-size: 17px;
		font-weight: 700;
	}
	.listhead {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-6);
		border-bottom: 1px solid var(--line);
		font-size: 12px;
		color: var(--muted);
	}
	.rows {
		overflow-y: auto;
		flex: 1;
		max-height: 62vh;
	}
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
