<script lang="ts">
	import type { Session } from './types';
	import { agg, fmtK, fmtMin } from './aggregate';
	import { latencyHourOption, modelMixOption, toolsOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import Chart from './Chart.svelte';
	import { Row, Spacer, Segmented, Badge, Card, CardTitle, Kpi, CardHint, Text } from '$lib/ui';

	let { session }: { session: Session } = $props();

	const st = useViewerState();

	const A = $derived(agg([session]));
	const tt = $derived(session.tokens.in + session.tokens.out);
	const latOption = $derived(latencyHourOption(A, st.latencyMode));
</script>

<Row>
	<Badge tone={session.tool}>{session.tool}</Badge>
	<h2 style="font-size:19px">{session.title}</h2>
	<Spacer />
	<Segmented
		variant="inset"
		label="Session view"
		options={[
			{ value: 'metrics', label: 'Metrics' },
			{ value: 'insights', label: 'Open in Insights' }
		]}
		value="metrics"
		onchange={(v) => {
			if (v === 'insights') st.view = 'insights';
		}}
	/>
</Row>
<Text tone="muted" style="display:block;margin-top:4px">
	{session.id} · {session.start.toISOString().replace('T', ' ').slice(0, 16)} UTC · {session.kind}{session.kind ===
		'root' && session.subagents.count
		? ` · ${session.subagents.count} subagents`
		: ''}
</Text>
<div class="detail-grid">
	<Card>
		<CardTitle>Turn count</CardTitle>
		<Kpi unit="turns">{session.turns}</Kpi>
	</Card>
	<Card>
		<CardTitle>
			Token usage · {#if session.tokens.basis === 'reconstructed'}<span
					class="basis-recon"
					title="Reconstructed by diffing — not exact">reconstructed</span
				>{:else}exact{/if}
		</CardTitle>
		<Kpi>{fmtK(tt)}</Kpi>
		<CardHint>
			in {fmtK(session.tokens.in)} · out {fmtK(session.tokens.out)} · cache {fmtK(
				session.tokens.cache
			)}
		</CardHint>
	</Card>
	<Card>
		<CardTitle>Duration</CardTitle>
		<Kpi>{fmtMin(session.durationMin)}</Kpi>
		<CardHint>
			active {fmtMin(Math.round(session.activeMs / 60000))} ({Math.round(
				(session.activeMs / 60000 / session.durationMin) * 100
			)}% of wall)
		</CardHint>
	</Card>
	<Card>
		<CardTitle>Subagent usage</CardTitle>
		<Kpi unit="children">{session.subagents.count}</Kpi>
		<CardHint>
			{fmtK(session.subagents.tokens)} tok · {tt
				? Math.round((session.subagents.tokens / (tt + session.subagents.tokens)) * 100)
				: 0}% of tree
		</CardHint>
	</Card>
	<Card>
		<CardTitle>Model mix</CardTitle>
		<Chart option={modelMixOption(A)} height={180} />
	</Card>
	<Card>
		<CardTitle>Tool usage</CardTitle>
		<Chart option={toolsOption(A)} height={180} />
	</Card>
	<Card style="grid-column:span 2">
		<Row>
			<CardTitle>Response latency by hour</CardTitle>
			<Spacer />
			<Segmented
				variant="inset"
				label="Latency mode"
				options={[
					{ value: 'raw', label: 'avg latency' },
					{ value: 'perToken', label: 'per output-token' }
				]}
				value={st.latencyMode}
				onchange={(v) => (st.latencyMode = v)}
			/>
		</Row>
		<Chart option={latOption} height={200} />
	</Card>
</div>

<style>
	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
		margin-top: 14px;
	}
	.basis-recon {
		color: var(--warn);
		border-bottom: 1px dashed var(--warn);
		cursor: help;
	}
</style>
