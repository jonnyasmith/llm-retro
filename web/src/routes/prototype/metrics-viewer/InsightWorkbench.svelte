<script lang="ts">
	import type { InferenceType, Session } from './types';
	import { fmtK, fmtMin, type InsightScope } from './aggregate';
	import { INFMETA } from './meta';
	import { useViewerState } from './viewerState.svelte';
	import ProvenanceStamp from './ProvenanceStamp.svelte';

	// sc kept in the prop contract for parity with the other variants.
	let { f }: { f: Session[]; sc: InsightScope } = $props();

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
	<div class="md-list" id="iList">
		{#each rail as s (s.id)}
			<div
				class="srow"
				class:sel={s.id === st.insightSel}
				data-isel={s.id}
				role="button"
				tabindex="0"
				onclick={() => (st.insightSel = s.id)}
				onkeydown={(e) => keyActivate(e, () => (st.insightSel = s.id))}
			>
				<div class="srow-top">
					<span class="badge {s.tool}">{s.tool}</span><span class="stitle">{s.title}</span>
				</div>
				<div class="srow-sub">
					{s.id} · {s.turns} turns ·
					{#if dots(s).length}
						{#each dots(s) as d, di (d.t)}
							{#if di > 0}{' '}{/if}<span class="idot" style="color:{INFMETA[d.t].color}"
								>{INFMETA[d.t].icon}{d.n}</span
							>
						{/each}
					{:else}
						<span class="dim">no inferences</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
	<div class="md-detail" id="iDetail">
		{#if sel}
			<div class="idetail-head">
				<div class="row">
					<h2 style="font-size:18px">{sel.title}</h2>
					<span class="spacer" style="flex:1"></span>
					<a
						href="#"
						class="metricslink"
						data-tometrics={sel.id}
						onclick={(e) => sel && toMetrics(e, sel.id)}>View metrics →</a
					>
				</div>
				<div class="muted" style="margin-top:2px">
					{sel.id} · {sel.tool} · {sel.dominantModel} · <b>{sel.turns}</b> turns · {fmtK(
						sel.tokens.in + sel.tokens.out
					)} tokens · {fmtMin(sel.durationMin)}
				</div>
			</div>
			<div class="thread">
				{#if threadItems.length === 0}
					<div class="muted" style="padding:18px 0">
						No Inferences — the model flagged nothing in this session.
					</div>
				{:else}
					{#each threadItems as it (it.inf.id)}
						{#if it.gapN > 0}
							<div class="tgap">⋯ {it.gapN} turn{it.gapN > 1 ? 's' : ''} without a flag</div>
						{/if}
						<div class="tturn" id="turn-{it.inf.turnRef}">
							<div class="tnum">
								Turn {it.inf.turnRef}<div class="tref pmono">{it.inf.messageRef}</div>
							</div>
							<div class="tbody">
								<div class="tmsg user"><span class="who">you</span> {it.inf.evidence}</div>
								<div class="tmsg ai">
									<span class="who">{sel.dominantModel}</span>
									<span class="dim">…the response you then redirected…</span>
								</div>
								<div class="annot" style="border-left-color:{INFMETA[it.inf.type].color}">
									<div class="row">
										<span class="itag" style="color:{INFMETA[it.inf.type].color}">
											{INFMETA[it.inf.type].icon} {INFMETA[it.inf.type].label}
										</span>
										<span class="spacer" style="flex:1"></span>
										<span class="conf">conf {(it.inf.confidence * 100).toFixed(0)}%</span>
									</div>
									<div class="isum">{it.inf.summary}</div>
									{#if it.inf.correctedTo}
										<div class="fix">
											heard <s>{it.inf.evidence}</s> → meant <b>{it.inf.correctedTo}</b>
										</div>
									{/if}
									{#if it.inf.degradedAtTokens}
										<div class="dim pmono">
											degraded @ ~{fmtK(it.inf.degradedAtTokens)} ctx tokens
										</div>
									{/if}
									<ProvenanceStamp p={it.inf.provenance} />
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{:else}
			<div class="muted">No session in scope.</div>
		{/if}
	</div>
</div>
