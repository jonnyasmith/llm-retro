<script lang="ts">
	import type { Session } from './types';
	import { fmtK, type InsightScope } from './aggregate';
	import { THEME_STAMP, THEME_TYPE } from './data';
	import { INFMETA } from './meta';
	import { dumbZoneOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import { Button, MasterDetail, Row, SelectableRow, Spacer, Text, Verdict } from '$lib/ui';
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

	function toMetrics(id: string) {
		st.selected = id;
		st.view = 'sessions';
	}
</script>

<MasterDetail>
	{#snippet list()}
		<div class="listhead"><span>Pattern</span></div>
		{#each items as it (it.id)}
			<SelectableRow
				layout="block"
				selected={st.themeSel === it.id}
				data-theme={it.id}
				onselect={() => (st.themeSel = it.id)}
			>
				<div class="srow-top"><span class="stitle">{it.title}</span></div>
				<div class="srow-sub">
					{it.id === 'DZ' ? 'deterministic aggregate' : 'thematic synthesis'} · {it.n} sessions
				</div>
			</SelectableRow>
		{/each}
	{/snippet}
	{#snippet detail()}
		{#if st.themeSel === 'DZ'}
			<div class="idetail-head">
				<h2 style="font-size:18px">Dumb-zone threshold</h2>
				<Text tone="muted" style="display:block;margin-top:2px">
					Deterministic — distribution over per-session degradation points, no 2nd model pass.
				</Text>
			</div>
			{#if sc.dza.points.length === 0}
				<Text tone="muted" style="display:block;padding:24px"
					>No degradation detected in this scope.</Text
				>
			{:else}
				<Chart option={dumbZoneOption(sc.dza)} height={220} />
			{/if}
			<Verdict label="Reads as →">
				{#if sc.dza.threshold}
					Quality degrades past <b>~{fmtK(sc.dza.threshold)}</b> context tokens — median of
					<b>{sc.dza.detected}/{sc.dza.total}</b> sessions.
				{:else}
					No degradation detected.
				{/if}
			</Verdict>
			<h3 class="dh">Sessions behind it</h3>
			{#each dzRows as s (s.id)}
				<div class="tsession">
					<Row>
						<b>{s.title}</b>
						<Text tone="dim">{s.id}</Text>
						<Spacer />
						<Text tone="dim" mono>~{fmtK(s.dumbZone!.degradedAtTokens ?? 0)} ctx</Text>
						<Button variant="link" data-tometrics={s.id} onclick={() => toMetrics(s.id)}
							>metrics →</Button
						>
					</Row>
				</div>
			{:else}
				<Text tone="dim">none</Text>
			{/each}
		{:else}
			{@const t = sc.themes.find((x) => x.id === st.themeSel)}
			{#if !t}
				<Text tone="muted">Select a pattern.</Text>
			{:else}
				{@const type = THEME_TYPE[t.id]}
				<div class="idetail-head">
					<h2 style="font-size:18px">{t.title}</h2>
					<Text tone="muted" style="display:block;margin-top:2px">{t.synthesis}</Text>
					<ProvenanceStamp p={THEME_STAMP} />
				</div>
				<h3 class="dh">
					{t.sessions.length} sessions · supporting {INFMETA[type].label.toLowerCase()} evidence
				</h3>
				{#each t.sessions as s (s.id)}
					{@const rel = s.inferences.filter((i) => i.type === type)}
					<div class="tsession">
						<Row>
							<b>{s.title}</b>
							<Text tone="dim">{s.id} · {s.tool}</Text>
							<Spacer />
							<Button variant="link" data-tometrics={s.id} onclick={() => toMetrics(s.id)}
								>metrics →</Button
							>
						</Row>
						{#if rel.length}
							{#each rel as inf (inf.id)}
								<InferenceCard inference={inf} />
							{/each}
						{:else}
							<Text tone="dim" style="display:block;font-size:12px">
								matched on Signals — no per-turn Inference of this type
							</Text>
						{/if}
					</div>
				{/each}
			{/if}
		{/if}
	{/snippet}
</MasterDetail>

<style>
	.listhead {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--line);
		font-size: 12px;
		color: var(--muted);
	}
	.srow-top {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.stitle {
		font-weight: 600;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.srow-sub {
		font-size: 11.5px;
		color: var(--dim);
		margin-top: 3px;
	}
	.idetail-head {
		border-bottom: 1px solid var(--line);
		padding-bottom: 12px;
		margin-bottom: 14px;
	}
	.dh {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--dim);
		margin: 26px 0 12px;
	}
	.tsession {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--panel);
		padding: 12px 14px;
		margin-bottom: 12px;
	}
	.tsession b {
		color: var(--ink);
	}
	.tsession :global(.infcard) {
		margin-top: 10px;
		margin-bottom: 0;
		background: var(--panel2);
	}
	.tsession :global(.infcard + .infcard) {
		margin-top: 8px;
	}
</style>
