<script lang="ts">
	import type { Session } from '$lib/features/viewers';
	import type { Aggregate, LatencyMode } from '$lib/features/viewers';
	import { fmtK, fmtMin, latStats } from '$lib/features/viewers';
	import {
		latencyHourOption,
		gaugeOption,
		modelMixOption,
		subagentShareOption,
		durationVsTurnsOption,
		toolsOption
	} from '$lib/features/viewers';
	import { Chart } from '$lib/features/viewers';
	import {
		Button,
		CardHint,
		ChartPanel,
		Col,
		Grid,
		SectionIntro,
		Segmented,
		StatCard,
		Verdict
	} from '$lib/design-system';

	let {
		f,
		a,
		latencyMode,
		onLatencyModeChange,
		onOpenInsights,
		onOpenSession
	}: {
		f: Session[];
		a: Aggregate;
		latencyMode: LatencyMode;
		onLatencyModeChange: (mode: LatencyMode) => void;
		onOpenInsights: () => void;
		onOpenSession: (sessionId: string) => void;
	} = $props();

	const stats = $derived(latStats(a));

	// Depends on latencyMode → must be derived so the toggle re-renders the hero.
	const latOption = $derived(latencyHourOption(a, latencyMode));
	const gaugeOpt = $derived(gaugeOption(stats.slower));
</script>

<SectionIntro id="q1" heading="Is the model slower in the afternoon?">
	{#snippet description()}
		Per-response latency bucketed by hour (Europe/London, DST-aware). The <b>per output-token</b> rate
		is the honest test — it factors out "it simply wrote more."
	{/snippet}
	<div class="heroband">
		<ChartPanel title="Latency by hour of day">
			{#snippet headerControls()}
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
			{/snippet}
			<Chart option={latOption} height={300} />
		</ChartPanel>
		<StatCard
			label="PM vs rest (per-token)"
			delta={stats.slower > 0 ? 'up' : 'down'}
			sub={`13:00–17:00 rate vs the rest of the day. ${stats.afternoon.toFixed(2)} vs ${stats.rest.toFixed(2)} ms/token.`}
		>
			{stats.slower > 0 ? '+' : ''}{stats.slower.toFixed(0)}%
			{#snippet footer()}<Chart option={gaugeOpt} height={150} />{/snippet}
		</StatCard>
	</div>
	<Verdict label="Reads as →">
		Afternoon per-token latency runs
		<b>{stats.slower.toFixed(0)}% higher</b> in scope.
		<Button variant="link" data-toretro onclick={onOpenInsights}>Open in Insights →</Button>
	</Verdict>
</SectionIntro>
<SectionIntro id="q2" heading="Where do my tokens go?">
	{#snippet description()}
		Model mix and the subagent share of the whole tree — what's actually consuming the budget.
	{/snippet}
	<Grid cols={6}>
		<Col span={3}>
			<ChartPanel title="By model">
				<Chart option={modelMixOption(a)} height={260} />
			</ChartPanel>
		</Col>
		<Col span={3}>
			<ChartPanel title="Root vs subagent tokens">
				<Chart option={subagentShareOption(a)} height={260} />
				<CardHint>{a.subCount} child sessions · {fmtK(a.subTokens)} tok delegated</CardHint>
			</ChartPanel>
		</Col>
	</Grid>
	<Verdict label="Reads as →">
		Subagents carry
		<b>{a.totalTokens ? Math.round((a.subTokens / a.totalTokens) * 100) : 0}%</b> of tokens.
		<Button variant="link" data-toretro onclick={onOpenInsights}>See delegation retro →</Button>
	</Verdict>
</SectionIntro>
<SectionIntro id="q3" heading="What shape are my sessions?">
	{#snippet description()}
		Duration vs turns — many short loops or few long grinds? Not a quality headline, a shape axis.
	{/snippet}
	<ChartPanel title="Duration vs turns" titleTransform="none">
		{#snippet headerControls()}
			<CardHint italic>click a point → open that session</CardHint>
		{/snippet}
		<Chart
			option={durationVsTurnsOption(f)}
			height={320}
			onpoint={(e) => {
				onOpenSession((e.data as [number, number, string])[2]);
			}}
		/>
	</ChartPanel>
	<Verdict label="Reads as →">
		{fmtMin(Math.round(a.durationMin / Math.max(a.sessions, 1)))} median wall per session,
		<b>{Math.round(a.turns / Math.max(a.sessions, 1))} turns</b> avg.
		<Button variant="link" data-toretro onclick={onOpenInsights}
			>Loop discipline in Insights →</Button
		>
	</Verdict>
</SectionIntro>
<SectionIntro id="q4" heading="What's my tooling footprint?">
	{#snippet description()}Which tools the models reach for, across scope.{/snippet}
	<ChartPanel>
		<Chart option={toolsOption(a)} height={260} />
	</ChartPanel>
</SectionIntro>

<style>
	.heroband {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--space-6);
	}
	@media (max-width: 700px) {
		.heroband {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
