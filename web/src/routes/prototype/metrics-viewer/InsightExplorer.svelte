<script lang="ts">
	import type { Session } from './types';
	import { fmtK, type InsightScope } from './aggregate';
	import { THEME_STAMP, THEME_TYPE } from './data';
	import { INFMETA } from './meta';
	import { dumbZoneOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import Chart from './Chart.svelte';
	import InferenceCard from './InferenceCard.svelte';
	import ProvenanceStamp from './ProvenanceStamp.svelte';

	let { f, sc }: { f: Session[]; sc: InsightScope } = $props();

	const st = useViewerState();

	const items = $derived([
		...sc.themes.map((t) => ({ id: t.id, title: t.title, n: t.sessions.length })),
		{ id: 'DZ', title: 'Dumb-zone threshold', n: sc.dza.detected }
	]);

	const dzRows = $derived(
		f
			.filter((s) => s.dumbZone)
			.sort((a, b) => (a.dumbZone!.degradedAtTokens ?? 0) - (b.dumbZone!.degradedAtTokens ?? 0))
	);

	function toMetrics(e: Event, id: string) {
		e.preventDefault();
		st.selected = id;
		st.view = 'sessions';
	}

	function keyActivate(e: KeyboardEvent, fn: () => void) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			fn();
		}
	}
</script>

<div class="md">
	<div class="md-list" id="iThemes">
		<div class="md-listhead"><span>Pattern</span></div>
		{#each items as it (it.id)}
			<div
				class="srow"
				class:sel={st.themeSel === it.id}
				data-theme={it.id}
				role="button"
				tabindex="0"
				onclick={() => (st.themeSel = it.id)}
				onkeydown={(e) => keyActivate(e, () => (st.themeSel = it.id))}
			>
				<div class="srow-top"><span class="stitle">{it.title}</span></div>
				<div class="srow-sub">
					{it.id === 'DZ' ? 'deterministic aggregate' : 'thematic synthesis'} · {it.n} sessions
				</div>
			</div>
		{/each}
	</div>
	<div class="md-detail" id="iDetail">
		{#if st.themeSel === 'DZ'}
			<div class="idetail-head">
				<h2 style="font-size:18px">Dumb-zone threshold</h2>
				<div class="muted" style="margin-top:2px">
					Deterministic — distribution over per-session degradation points, no 2nd model pass.
				</div>
			</div>
			{#if sc.dza.points.length === 0}
				<div class="muted" style="padding:24px">No degradation detected in this scope.</div>
			{:else}
				<Chart option={dumbZoneOption(sc.dza)} height={220} />
			{/if}
			<div class="verdict">
				<span class="lbl">Reads as →</span>
				{#if sc.dza.threshold}
					Quality degrades past <b>~{fmtK(sc.dza.threshold)}</b> context tokens — median of
					<b>{sc.dza.detected}/{sc.dza.total}</b> sessions.
				{:else}
					No degradation detected.
				{/if}
			</div>
			<h3 class="dh">Sessions behind it</h3>
			{#each dzRows as s (s.id)}
				<div class="tsession">
					<div class="row">
						<b>{s.title}</b> <span class="dim">{s.id}</span>
						<span class="spacer" style="flex:1"></span>
						<span class="dim pmono">~{fmtK(s.dumbZone!.degradedAtTokens ?? 0)} ctx</span>
						<a
							href="#"
							class="metricslink"
							data-tometrics={s.id}
							onclick={(e) => toMetrics(e, s.id)}>metrics →</a
						>
					</div>
				</div>
			{:else}
				<div class="dim">none</div>
			{/each}
		{:else}
			{@const t = sc.themes.find((x) => x.id === st.themeSel)}
			{#if !t}
				<div class="muted">Select a pattern.</div>
			{:else}
				{@const type = THEME_TYPE[t.id]}
				<div class="idetail-head">
					<h2 style="font-size:18px">{t.title}</h2>
					<div class="muted" style="margin-top:2px">{t.synthesis}</div>
					<ProvenanceStamp p={THEME_STAMP} />
				</div>
				<h3 class="dh">
					{t.sessions.length} sessions · supporting {INFMETA[type].label.toLowerCase()} evidence
				</h3>
				{#each t.sessions as s (s.id)}
					{@const rel = s.inferences.filter((i) => i.type === type)}
					<div class="tsession">
						<div class="row">
							<b>{s.title}</b> <span class="dim">{s.id} · {s.tool}</span>
							<span class="spacer" style="flex:1"></span>
							<a
								href="#"
								class="metricslink"
								data-tometrics={s.id}
								onclick={(e) => toMetrics(e, s.id)}>metrics →</a
							>
						</div>
						{#if rel.length}
							{#each rel as inf (inf.id)}
								<InferenceCard inference={inf} />
							{/each}
						{:else}
							<div class="dim" style="font-size:12px">
								matched on Signals — no per-turn Inference of this type
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</div>
