<script lang="ts">
	import type { Session } from './types';
	import type { Aggregate } from './aggregate';
	import { fmtK, fmtMin, latStats } from './aggregate';
	import {
		latencyHourOption,
		gaugeOption,
		modelMixOption,
		subagentShareOption,
		durationVsTurnsOption,
		toolsOption
	} from './charts';
	import Chart from './Chart.svelte';
	import {
		Card,
		CardTitle,
		CardHint,
		Grid,
		Col,
		Row,
		Spacer,
		Segmented,
		Kpi,
		Verdict,
		Button
	} from '$lib/ui';
	import { useViewerState } from './viewerState.svelte';

	let { f, a }: { f: Session[]; a: Aggregate } = $props();

	const st = useViewerState();
	const stats = $derived(latStats(a));

	// Depends on latencyMode → must be derived so the toggle re-renders the hero.
	const latOption = $derived(latencyHourOption(a, st.latencyMode));
	const gaugeOpt = $derived(gaugeOption(stats.slower));

	const openInsights = () => {
		st.view = 'insights';
	};
</script>

<section class="section" id="q1">
	<div class="q">Is the model slower in the afternoon?</div>
	<div class="sub">
		Per-response latency bucketed by hour (Europe/London, DST-aware). The <b>per output-token</b> rate
		is the honest test — it factors out "it simply wrote more."
	</div>
	<div class="heroband">
		<Card>
			<Row>
				<CardTitle>Latency by hour of day</CardTitle>
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
			<Chart option={latOption} height={300} />
		</Card>
		<Card>
			<CardTitle>PM vs rest (per-token)</CardTitle>
			<Kpi delta={stats.slower > 0 ? 'up' : 'down'}>
				{stats.slower > 0 ? '+' : ''}{stats.slower.toFixed(0)}%
			</Kpi>
			<CardHint>
				13:00–17:00 rate vs the rest of the day. {stats.afternoon.toFixed(2)} vs {stats.rest.toFixed(
					2
				)} ms/token.
			</CardHint>
			<Chart option={gaugeOpt} height={150} />
		</Card>
	</div>
	<Verdict label="Reads as →">
		Afternoon per-token latency runs
		<b>{stats.slower.toFixed(0)}% higher</b> in scope.
		<Button variant="link" data-toretro onclick={openInsights}>Open in Insights →</Button>
	</Verdict>
</section>
<section class="section" id="q2">
	<div class="q">Where do my tokens go?</div>
	<div class="sub">
		Model mix and the subagent share of the whole tree — what's actually consuming the budget.
	</div>
	<Grid cols={6}>
		<Col span={3}>
			<Card>
				<CardTitle>By model</CardTitle>
				<Chart option={modelMixOption(a)} height={260} />
			</Card>
		</Col>
		<Col span={3}>
			<Card>
				<CardTitle>Root vs subagent tokens</CardTitle>
				<Chart option={subagentShareOption(a)} height={260} />
				<CardHint>{a.subCount} child sessions · {fmtK(a.subTokens)} tok delegated</CardHint>
			</Card>
		</Col>
	</Grid>
	<Verdict label="Reads as →">
		Subagents carry
		<b>{a.totalTokens ? Math.round((a.subTokens / a.totalTokens) * 100) : 0}%</b> of tokens.
		<Button variant="link" data-toretro onclick={openInsights}>See delegation retro →</Button>
	</Verdict>
</section>
<section class="section" id="q3">
	<div class="q">What shape are my sessions?</div>
	<div class="sub">
		Duration vs turns — many short loops or few long grinds? Not a quality headline, a shape axis.
	</div>
	<Card>
		<Row>
			<CardTitle style="text-transform:none">Duration vs turns</CardTitle>
			<span class="drilltip" style="margin-left:auto">click a point → open that session</span>
		</Row>
		<Chart
			option={durationVsTurnsOption(f)}
			height={320}
			onpoint={(e) => {
				st.selected = (e.data as [number, number, string])[2];
				st.view = 'sessions';
			}}
		/>
	</Card>
	<Verdict label="Reads as →">
		{fmtMin(Math.round(a.durationMin / Math.max(a.sessions, 1)))} median wall per session,
		<b>{Math.round(a.turns / Math.max(a.sessions, 1))} turns</b> avg.
		<Button variant="link" data-toretro onclick={openInsights}>Loop discipline in Insights →</Button
		>
	</Verdict>
</section>
<section class="section" id="q4">
	<div class="q">What's my tooling footprint?</div>
	<div class="sub">Which tools the models reach for, across scope.</div>
	<Card>
		<Chart option={toolsOption(a)} height={260} />
	</Card>
</section>

<style>
	.section {
		margin-bottom: 44px;
		scroll-margin-top: 130px;
	}
	.q {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.3px;
		margin-bottom: 4px;
	}
	.sub {
		color: var(--muted);
		margin-bottom: 16px;
		max-width: 720px;
	}
	.heroband {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--space-6);
	}
	.drilltip {
		color: var(--dim);
		font-size: 11.5px;
		font-style: italic;
	}
</style>
