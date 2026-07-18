<script lang="ts">
	import type { Session } from './types';
	import { fmtK, type InsightScope } from './aggregate';
	import { THEME_STAMP } from './data';
	import { dumbZoneOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import { useVariants } from '$lib/prototype/variants.svelte';
	import Chart from './Chart.svelte';
	import ProvenanceStamp from './ProvenanceStamp.svelte';

	let { f, sc }: { f: Session[]; sc: InsightScope } = $props();

	const st = useViewerState();
	const vb = useVariants();

	function jump(id: string) {
		st.insightSel = id;
		vb.select('B');
	}

	const topTheme = $derived(
		[...sc.themes].sort((a, b) => b.sessions.length - a.sessions.length)[0]
	);
	const mostCC = $derived(
		[...f]
			.map((s) => [s, s.inferences.filter((i) => i.type === 'course-correction').length] as const)
			.sort((a, b) => b[1] - a[1])[0]
	);
	const noiseS = $derived(f.find((s) => s.inferences.some((i) => i.type === 'input-noise')));
</script>

<div class="digest">
	<div class="row">
		<h2>Retro digest</h2>
		<span class="spacer" style="flex:1"></span>
		<button class="pill on" style="cursor:pointer">↻ Regenerate synthesis</button>
	</div>
	<p class="qsub">
		A generated read of this scope. Chips jump into the Workbench for the evidence.
	</p>
	<div class="findgrid">
		{#if topTheme}
			<div class="findcard" style="border-left-color:#4c8dff">
				<div class="findk" style="color:#4c8dff">◆ Dominant pattern</div>
				<div class="findb">
					<b>{topTheme.title}</b> — {topTheme.sessions.length} sessions. {topTheme.synthesis}
				</div>
			</div>
		{/if}
		{#if sc.dza.threshold}
			<div class="findcard" style="border-left-color:#e06c75">
				<div class="findk" style="color:#e06c75">▽ Quality cliff</div>
				<div class="findb">
					Output degrades past <b>~{fmtK(sc.dza.threshold)}</b> context tokens (median of
					{sc.dza.detected}/{sc.dza.total} sessions where degradation showed). Split long loops sooner.
				</div>
			</div>
		{/if}
		{#if mostCC && mostCC[1] > 0}
			<div class="findcard" style="border-left-color:#e2b341">
				<div class="findk" style="color:#e2b341">⤺ Most redirected</div>
				<div class="findb">
					<b>{mostCC[0].title}</b> ({mostCC[0].id}) took <b>{mostCC[1]}</b> course-corrections to
					keep on track.
					<a
						href="#"
						data-jump={mostCC[0].id}
						onclick={(e) => {
							e.preventDefault();
							if (mostCC) jump(mostCC[0].id);
						}}>See the turns →</a
					>
				</div>
			</div>
		{/if}
		{#if noiseS}
			<div class="findcard" style="border-left-color:#c678dd">
				<div class="findk" style="color:#c678dd">⌇ Input-noise waste</div>
				<div class="findb">
					Garbled prompts cost turns in {sc.byType['input-noise']} places — e.g. <b>{noiseS.id}</b>.
					<a
						href="#"
						data-jump={noiseS.id}
						onclick={(e) => {
							e.preventDefault();
							if (noiseS) jump(noiseS.id);
						}}>See where →</a
					>
				</div>
			</div>
		{/if}
	</div>
	<h3 class="dh">Themes</h3>
	<div class="tlist">
		{#each sc.themes as t (t.id)}
			<div class="tlrow">
				<div class="row">
					<b>{t.title}</b>
					<span class="spacer" style="flex:1"></span>
					<span class="dim pmono">{t.sessions.length} sessions</span>
				</div>
				<div class="hint">{t.synthesis}</div>
				<div class="chips">
					{#each t.sessions.slice(0, 10) as s (s.id)}
						<span
							class="chip"
							data-jump={s.id}
							role="button"
							tabindex="0"
							onclick={() => jump(s.id)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									jump(s.id);
								}
							}}>{s.id}</span
						>
					{/each}
					{#if t.sessions.length > 10}
						<span class="chip more">+{t.sessions.length - 10}</span>
					{/if}
				</div>
			</div>
		{:else}
			<div class="dim">No themes for this scope.</div>
		{/each}
	</div>
	<h3 class="dh">
		Dumb-zone aggregate <span class="dim" style="font-weight:400">· deterministic</span>
	</h3>
	{#if sc.dza.points.length === 0}
		<div class="muted" style="padding:24px">No degradation detected in this scope.</div>
	{:else}
		<Chart option={dumbZoneOption(sc.dza)} height={210} />
	{/if}
	<ProvenanceStamp p={THEME_STAMP} />
</div>
