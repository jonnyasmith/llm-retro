<script lang="ts">
	import type { Session } from './types';
	import { agg, fmtK, fmtMin } from './aggregate';
	import { latencyHourOption, modelMixOption, toolsOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import Chart from './Chart.svelte';
	import SessionDetailHeader from '$lib/components/prototypes/SessionDetailHeader.svelte';
	import TokenBasisLabel from '$lib/components/prototypes/TokenBasisLabel.svelte';
	import { Row, Spacer, Segmented, Card, CardTitle, Kpi, CardHint } from '$lib/ui';

	let { session }: { session: Session } = $props();

	const st = useViewerState();

	const A = $derived(agg([session]));
	const tt = $derived(session.tokens.in + session.tokens.out);
	const latOption = $derived(latencyHourOption(A, st.latencyMode));
</script>

<SessionDetailHeader
	session={{
		id: session.id,
		title: session.title,
		tool: session.tool,
		start: session.start,
		kind: session.kind,
		subagentCount: session.subagents.count
	}}
	onOpenInsights={() => (st.view = 'insights')}
/>
<div class="detail-grid">
	<Card>
		<CardTitle>Turn count</CardTitle>
		<Kpi unit="turns">{session.turns}</Kpi>
	</Card>
	<Card>
		<CardTitle>
			Token usage · <TokenBasisLabel basis={session.tokens.basis} />
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
</style>
