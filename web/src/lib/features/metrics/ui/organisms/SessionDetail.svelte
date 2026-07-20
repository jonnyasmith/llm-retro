<script lang="ts">
	import type { Session } from '$lib/features/viewers';
	import { agg, fmtK, fmtMin, type LatencyMode } from '$lib/features/viewers';
	import { latencyHourOption, modelMixOption, toolsOption } from '$lib/features/viewers';
	import { Chart } from '$lib/features/viewers';
	import SessionDetailHeader from './SessionDetailHeader.svelte';
	import TokenBasisLabel from '../atoms/TokenBasisLabel.svelte';
	import { Row, Spacer, Segmented, Card, CardTitle, Kpi, CardHint } from '$lib/design-system';

	let {
		session,
		latencyMode,
		onLatencyModeChange,
		onOpenInsights
	}: {
		session: Session;
		latencyMode: LatencyMode;
		onLatencyModeChange: (mode: LatencyMode) => void;
		onOpenInsights: () => void;
	} = $props();

	const A = $derived(agg([session]));
	const tt = $derived(session.tokens.in + session.tokens.out);
	const latOption = $derived(latencyHourOption(A, latencyMode));
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
	{onOpenInsights}
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
				value={latencyMode}
				onchange={onLatencyModeChange}
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
	@media (max-width: 700px) {
		.detail-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.detail-grid > :global(*) {
			grid-column: auto !important;
		}
	}
</style>
