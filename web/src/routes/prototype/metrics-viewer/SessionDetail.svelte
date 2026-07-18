<script lang="ts">
	import type { Session } from './types';
	import { agg, fmtK, fmtMin } from './aggregate';
	import { latencyHourOption, modelMixOption, toolsOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import Chart from './Chart.svelte';

	let { session }: { session: Session } = $props();

	const st = useViewerState();

	const A = $derived(agg([session]));
	const tt = $derived(session.tokens.in + session.tokens.out);
	const latOption = $derived(latencyHourOption(A, st.latencyMode));
</script>

<div class="row">
	<span class="badge {session.tool}">{session.tool}</span>
	<h2 style="font-size:19px">{session.title}</h2>
	<span class="spacer" style="flex:1"></span>
	<div class="viewtabs">
		<button class="on">Metrics</button>
		<button onclick={() => (st.view = 'insights')}>Open in Insights</button>
	</div>
</div>
<div class="muted" style="margin-top:4px">
	{session.id} · {session.start.toISOString().replace('T', ' ').slice(0, 16)} UTC · {session.kind}{session.kind ===
		'root' && session.subagents.count
		? ` · ${session.subagents.count} subagents`
		: ''}
</div>
<div class="detail-grid">
	<div class="card">
		<h3>Turn count</h3>
		<div class="kpi">{session.turns}<small>turns</small></div>
	</div>
	<div class="card">
		<h3>
			Token usage · {#if session.tokens.basis === 'reconstructed'}<span
					class="basis-recon"
					title="Reconstructed by diffing — not exact">reconstructed</span
				>{:else}exact{/if}
		</h3>
		<div class="kpi">{fmtK(tt)}</div>
		<div class="hint">
			in {fmtK(session.tokens.in)} · out {fmtK(session.tokens.out)} · cache {fmtK(session.tokens.cache)}
		</div>
	</div>
	<div class="card">
		<h3>Duration</h3>
		<div class="kpi">{fmtMin(session.durationMin)}</div>
		<div class="hint">
			active {fmtMin(Math.round(session.activeMs / 60000))} ({Math.round(
				(session.activeMs / 60000 / session.durationMin) * 100
			)}% of wall)
		</div>
	</div>
	<div class="card">
		<h3>Subagent usage</h3>
		<div class="kpi">{session.subagents.count}<small>children</small></div>
		<div class="hint">
			{fmtK(session.subagents.tokens)} tok · {tt
				? Math.round((session.subagents.tokens / (tt + session.subagents.tokens)) * 100)
				: 0}% of tree
		</div>
	</div>
	<div class="card">
		<h3>Model mix</h3>
		<Chart option={modelMixOption(A)} height={180} />
	</div>
	<div class="card">
		<h3>Tool usage</h3>
		<Chart option={toolsOption(A)} height={180} />
	</div>
	<div class="card" style="grid-column:span 2">
		<div class="row">
			<h3>Response latency by hour</h3>
			<span class="spacer" style="flex:1"></span>
			<div class="toggle">
				<button
					class:on={st.latencyMode === 'raw'}
					onclick={() => (st.latencyMode = 'raw')}>avg latency</button
				>
				<button
					class:on={st.latencyMode === 'perToken'}
					onclick={() => (st.latencyMode = 'perToken')}>per output-token</button
				>
			</div>
		</div>
		<Chart option={latOption} height={200} />
	</div>
</div>
