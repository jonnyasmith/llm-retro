<script lang="ts">
	import type { InferenceType, Session } from './types';
	import { fmtK, fmtMin } from './aggregate';
	import { INFMETA } from './meta';
	import { useViewerState } from './viewerState.svelte';
	import { Badge, Button, MasterDetail, Row, SelectableRow, Spacer, Text } from '$lib/ui';
	import ProvenanceStamp from './ProvenanceStamp.svelte';

	let { f }: { f: Session[] } = $props();

	const st = useViewerState();

	const rail = $derived([...f].sort((a, b) => b.inferences.length - a.inferences.length));
	const sel = $derived(f.find((s) => s.id === st.insightSel));

	const threadItems = $derived.by(() => {
		const s = sel;
		if (!s) return [];
		const infs = [...s.inferences].sort((a, b) => a.turnRef - b.turnRef);
		return infs.map((inf, idx) => ({
			inf,
			gapN: idx === 0 ? inf.turnRef - 1 : inf.turnRef - infs[idx - 1].turnRef - 1
		}));
	});

	function dots(s: Session): { t: InferenceType; n: number }[] {
		const counts: Record<InferenceType, number> = {
			'course-correction': 0,
			'input-noise': 0,
			'dumb-zone': 0
		};
		for (const i of s.inferences) counts[i.type]++;
		return (Object.entries(counts) as [InferenceType, number][])
			.filter(([, n]) => n)
			.map(([t, n]) => ({ t, n }));
	}

	function toMetrics(id: string) {
		st.selected = id;
		st.view = 'sessions';
	}
</script>

<MasterDetail>
	{#snippet list()}
		{#each rail as s (s.id)}
			<SelectableRow
				layout="block"
				selected={s.id === st.insightSel}
				data-isel={s.id}
				onselect={() => (st.insightSel = s.id)}
			>
				<div class="srow-top">
					<Badge tone={s.tool}>{s.tool}</Badge><span class="stitle">{s.title}</span>
				</div>
				<div class="srow-sub">
					{s.id} · {s.turns} turns ·
					{#if dots(s).length}
						{#each dots(s) as d, di (d.t)}
							{#if di > 0}&nbsp;{/if}<span class="idot" style="color:{INFMETA[d.t].color}"
								>{INFMETA[d.t].icon}{d.n}</span
							>
						{/each}
					{:else}
						<Text tone="dim">no inferences</Text>
					{/if}
				</div>
			</SelectableRow>
		{/each}
	{/snippet}
	{#snippet detail()}
		{#if sel}
			<div class="idetail-head">
				<Row>
					<h2 style="font-size:18px">{sel.title}</h2>
					<Spacer />
					<Button variant="link" data-tometrics={sel.id} onclick={() => sel && toMetrics(sel.id)}
						>View metrics →</Button
					>
				</Row>
				<Text tone="muted" style="display:block;margin-top:2px">
					{sel.id} · {sel.tool} · {sel.dominantModel} · <b>{sel.turns}</b> turns · {fmtK(
						sel.tokens.in + sel.tokens.out
					)} tokens · {fmtMin(sel.durationMin)}
				</Text>
			</div>
			<div class="thread">
				{#if threadItems.length === 0}
					<Text tone="muted" style="display:block;padding:18px 0">
						No Inferences — the model flagged nothing in this session.
					</Text>
				{:else}
					{#each threadItems as it (it.inf.id)}
						{#if it.gapN > 0}
							<div class="tgap">⋯ {it.gapN} turn{it.gapN > 1 ? 's' : ''} without a flag</div>
						{/if}
						<div class="tturn" id="turn-{it.inf.turnRef}">
							<div class="tnum">
								Turn {it.inf.turnRef}
								<div class="tref">{it.inf.messageRef}</div>
							</div>
							<div class="tbody">
								<div class="tmsg user"><span class="who">you</span> {it.inf.evidence}</div>
								<div class="tmsg ai">
									<span class="who">{sel.dominantModel}</span>
									<Text tone="dim">…the response you then redirected…</Text>
								</div>
								<div class="annot" style="border-left-color:{INFMETA[it.inf.type].color}">
									<Row>
										<span class="itag" style="color:{INFMETA[it.inf.type].color}">
											{INFMETA[it.inf.type].icon}
											{INFMETA[it.inf.type].label}
										</span>
										<Spacer />
										<span class="conf">conf {(it.inf.confidence * 100).toFixed(0)}%</span>
									</Row>
									<div class="isum">{it.inf.summary}</div>
									{#if it.inf.correctedTo}
										<div class="fix">
											heard <s>{it.inf.evidence}</s> → meant <b>{it.inf.correctedTo}</b>
										</div>
									{/if}
									{#if it.inf.degradedAtTokens}
										<Text tone="dim" mono style="display:block">
											degraded @ ~{fmtK(it.inf.degradedAtTokens)} ctx tokens
										</Text>
									{/if}
									<ProvenanceStamp p={it.inf.provenance} />
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{:else}
			<Text tone="muted">No session in scope.</Text>
		{/if}
	{/snippet}
</MasterDetail>

<style>
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
	.idot {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 700;
	}
	.idetail-head {
		border-bottom: 1px solid var(--line);
		padding-bottom: 12px;
		margin-bottom: 14px;
	}
	.thread {
		position: relative;
		padding-left: 4px;
	}
	.tgap {
		color: var(--dim);
		font-size: 11.5px;
		font-style: italic;
		margin: 6px 0 6px 76px;
	}
	.tturn {
		display: grid;
		grid-template-columns: 72px 1fr;
		gap: 12px;
		margin-bottom: 14px;
		scroll-margin-top: 130px;
	}
	.tnum {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
		text-align: right;
		padding-top: 6px;
	}
	.tref {
		color: var(--dim);
		font-weight: 400;
		font-size: 10px;
		margin-top: 2px;
		font-family: var(--mono);
	}
	.tbody {
		min-width: 0;
	}
	.tmsg {
		font-size: 12.5px;
		padding: 6px 10px;
		border-radius: 8px;
		margin-bottom: 5px;
	}
	.tmsg.user {
		background: var(--panel2);
		color: var(--ink);
	}
	.tmsg.ai {
		background: transparent;
		border: 1px dashed var(--line);
	}
	.tmsg .who {
		font-family: var(--mono);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--dim);
		margin-right: 6px;
	}
	.annot {
		border: 1px solid var(--line);
		border-left: 3px solid var(--accent);
		border-radius: 0 8px 8px 0;
		background: var(--panel);
		padding: 10px 12px;
		margin-top: 6px;
	}
	.itag {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.isum {
		margin: 4px 0 8px;
		font-size: 13.5px;
		color: var(--ink);
	}
	.fix {
		margin: 0 0 8px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.fix s {
		color: var(--dim);
	}
	.conf {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--dim);
	}
</style>
