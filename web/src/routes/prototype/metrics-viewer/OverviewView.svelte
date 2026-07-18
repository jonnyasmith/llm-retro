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
	import { useViewerState } from './viewerState.svelte';

	let { f, a }: { f: Session[]; a: Aggregate } = $props();

	const st = useViewerState();
	const stats = $derived(latStats(a));

	// Depends on latencyMode → must be derived so the toggle re-renders the hero.
	const latOption = $derived(latencyHourOption(a, st.latencyMode));
	const gaugeOpt = $derived(gaugeOption(stats.slower));

	const openInsights = (e: MouseEvent) => {
		e.preventDefault();
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
		<div class="card">
			<div class="row">
				<h3>Latency by hour of day</h3>
				<span class="spacer" style="flex:1"></span>
				<div class="toggle">
					<button
						class={st.latencyMode === 'raw' ? 'on' : ''}
						onclick={() => (st.latencyMode = 'raw')}>avg latency</button
					>
					<button
						class={st.latencyMode === 'perToken' ? 'on' : ''}
						onclick={() => (st.latencyMode = 'perToken')}>per output-token</button
					>
				</div>
			</div>
			<Chart option={latOption} height={300} />
		</div>
		<div class="card">
			<h3>PM vs rest (per-token)</h3>
			<div class="kpi {stats.slower > 0 ? 'delta up' : 'delta down'}">
				{stats.slower > 0 ? '+' : ''}{stats.slower.toFixed(0)}%
			</div>
			<div class="hint">
				13:00–17:00 rate vs the rest of the day. {stats.afternoon.toFixed(2)} vs {stats.rest.toFixed(
					2
				)} ms/token.
			</div>
			<Chart option={gaugeOpt} height={150} />
		</div>
	</div>
	<div class="verdict">
		<span class="lbl">Reads as →</span> Afternoon per-token latency runs
		<b>{stats.slower.toFixed(0)}% higher</b> in scope.
		<a href="#" data-toretro onclick={openInsights}>Open in Insights →</a>
	</div>
</section>
<section class="section" id="q2">
	<div class="q">Where do my tokens go?</div>
	<div class="sub">
		Model mix and the subagent share of the whole tree — what's actually consuming the budget.
	</div>
	<div class="grid">
		<div class="card col3">
			<h3>By model</h3>
			<Chart option={modelMixOption(a)} height={260} />
		</div>
		<div class="card col3">
			<h3>Root vs subagent tokens</h3>
			<Chart option={subagentShareOption(a)} height={260} />
			<div class="hint">{a.subCount} child sessions · {fmtK(a.subTokens)} tok delegated</div>
		</div>
	</div>
	<div class="verdict">
		<span class="lbl">Reads as →</span> Subagents carry
		<b>{a.totalTokens ? Math.round((a.subTokens / a.totalTokens) * 100) : 0}%</b> of tokens.
		<a href="#" data-toretro onclick={openInsights}>See delegation retro →</a>
	</div>
</section>
<section class="section" id="q3">
	<div class="q">What shape are my sessions?</div>
	<div class="sub">
		Duration vs turns — many short loops or few long grinds? Not a quality headline, a shape axis.
	</div>
	<div class="card">
		<div class="row">
			<h3 style="text-transform:none;color:var(--muted)">Duration vs turns</h3>
			<span class="drilltip" style="margin-left:auto">click a point → open that session</span>
		</div>
		<Chart
			option={durationVsTurnsOption(f)}
			height={320}
			onpoint={(e) => {
				st.selected = (e.data as [number, number, string])[2];
				st.view = 'sessions';
			}}
		/>
	</div>
	<div class="verdict">
		<span class="lbl">Reads as →</span>
		{fmtMin(Math.round(a.durationMin / Math.max(a.sessions, 1)))} median wall per session,
		<b>{Math.round(a.turns / Math.max(a.sessions, 1))} turns</b> avg.
		<a href="#" data-toretro onclick={openInsights}>Loop discipline in Insights →</a>
	</div>
</section>
<section class="section" id="q4">
	<div class="q">What's my tooling footprint?</div>
	<div class="sub">Which tools the models reach for, across scope.</div>
	<div class="card">
		<Chart option={toolsOption(a)} height={260} />
	</div>
</section>
