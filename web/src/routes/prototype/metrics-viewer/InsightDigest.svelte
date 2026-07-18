<script lang="ts">
	import type { Session } from './types';
	import { fmtK, type InsightScope } from './aggregate';
	import { THEME_STAMP } from './data';
	import { dumbZoneOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import { useVariants } from '$lib/prototype/variants.svelte';
	import { Button, Chip, Row, Spacer, Text } from '$lib/ui';
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
	<Row>
		<h2>Retro digest</h2>
		<Spacer />
		<Button variant="pill">↻ Regenerate synthesis</Button>
	</Row>
	<p class="qsub">
		A generated read of this scope. Chips jump into the Workbench for the evidence.
	</p>
	<div class="findgrid">
		{#if topTheme}
			<div class="findcard" style="border-left-color:var(--accent)">
				<div class="findk" style="color:var(--accent)">◆ Dominant pattern</div>
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
					<Button
						variant="link"
						data-jump={mostCC[0].id}
						onclick={() => {
							if (mostCC) jump(mostCC[0].id);
						}}>See the turns →</Button
					>
				</div>
			</div>
		{/if}
		{#if noiseS}
			<div class="findcard" style="border-left-color:#c678dd">
				<div class="findk" style="color:#c678dd">⌇ Input-noise waste</div>
				<div class="findb">
					Garbled prompts cost turns in {sc.byType['input-noise']} places — e.g. <b>{noiseS.id}</b>.
					<Button
						variant="link"
						data-jump={noiseS.id}
						onclick={() => {
							if (noiseS) jump(noiseS.id);
						}}>See where →</Button
					>
				</div>
			</div>
		{/if}
	</div>
	<h3 class="dh">Themes</h3>
	<div class="tlist">
		{#each sc.themes as t (t.id)}
			<div class="tlrow">
				<Row>
					<b>{t.title}</b>
					<Spacer />
					<Text tone="dim" mono>{t.sessions.length} sessions</Text>
				</Row>
				<div>{t.synthesis}</div>
				<div class="chips">
					{#each t.sessions.slice(0, 10) as s (s.id)}
						<Chip data-jump={s.id} onclick={() => jump(s.id)}>{s.id}</Chip>
					{/each}
					{#if t.sessions.length > 10}
						<Chip variant="more">+{t.sessions.length - 10}</Chip>
					{/if}
				</div>
			</div>
		{:else}
			<Text tone="dim">No themes for this scope.</Text>
		{/each}
	</div>
	<h3 class="dh">
		Dumb-zone aggregate <Text tone="dim" style="font-weight:400">· deterministic</Text>
	</h3>
	{#if sc.dza.points.length === 0}
		<Text tone="muted" style="display:block;padding:24px"
			>No degradation detected in this scope.</Text
		>
	{:else}
		<Chart option={dumbZoneOption(sc.dza)} height={210} />
	{/if}
	<ProvenanceStamp p={THEME_STAMP} />
</div>

<style>
	.digest {
		max-width: none;
	}
	.qsub {
		color: var(--muted);
		margin: 0 0 16px;
		max-width: 780px;
	}
	.findgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 12px;
		margin-top: 8px;
	}
	.findcard {
		border: 1px solid var(--line);
		border-left: 3px solid var(--accent);
		border-radius: 0 8px 8px 0;
		background: var(--panel);
		padding: 12px 14px;
	}
	.findk {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 5px;
	}
	.findb {
		font-size: 13px;
		color: var(--muted);
	}
	.findb b {
		color: var(--ink);
	}
	.tlist {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.tlrow {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--panel);
		padding: 12px 14px;
	}
	.tlrow b {
		color: var(--ink);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin: 10px 0;
	}
	.dh {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--dim);
		margin: 26px 0 12px;
	}
</style>
