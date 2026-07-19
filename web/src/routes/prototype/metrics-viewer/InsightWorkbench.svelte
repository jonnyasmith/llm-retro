<script lang="ts">
	import type { InferenceType, Session } from './types';
	import { fmtK, fmtMin } from './aggregate';
	import { NOW } from './data';
	import { INFMETA } from './meta';
	import { useViewerState } from './viewerState.svelte';
	import { Button, MasterDetail, SelectableRow, Text } from '$lib/ui';
	import { INFERENCE_PRESENTATION } from '$lib/components/prototypes/Inference.presentation';
	import InsightDetailHeader from '$lib/components/prototypes/InsightDetailHeader.svelte';
	import InsightEmptyState from '$lib/components/prototypes/InsightEmptyState.svelte';
	import InsightRailContent from '$lib/components/prototypes/InsightRailContent.svelte';
	import TranscriptTurn from '$lib/components/prototypes/TranscriptTurn.svelte';

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
				<InsightRailContent
					entry={{
						title: s.title,
						metadata: `${s.id} · ${s.turns} turns ·${dots(s).length ? '' : ' no inferences'}`,
						tool: s.tool,
						markers: dots(s).map(({ t, n }) => ({
							icon: INFMETA[t].icon,
							count: n,
							accent: INFERENCE_PRESENTATION[t].accent
						}))
					}}
				/>
			</SelectableRow>
		{/each}
	{/snippet}
	{#snippet detail()}
		{#if sel}
			<InsightDetailHeader heading={sel.title}>
				{#snippet action()}
					<Button variant="link" data-tometrics={sel.id} onclick={() => sel && toMetrics(sel.id)}
						>View metrics →</Button
					>
				{/snippet}
				{#snippet description()}
					{sel.id} · {sel.tool} · {sel.dominantModel} · <b>{sel.turns}</b> turns · {fmtK(
						sel.tokens.in + sel.tokens.out
					)} tokens · {fmtMin(sel.durationMin)}
				{/snippet}
			</InsightDetailHeader>
			<div class="thread">
				{#if threadItems.length === 0}
					<InsightEmptyState spacing="thread">
						No Inferences — the model flagged nothing in this session.
					</InsightEmptyState>
				{:else}
					{#each threadItems as it (it.inf.id)}
						<TranscriptTurn inference={it.inf} model={sel.dominantModel} gap={it.gapN} now={NOW} />
					{/each}
				{/if}
			</div>
		{:else}
			<Text tone="muted">No session in scope.</Text>
		{/if}
	{/snippet}
</MasterDetail>

<style>
	.thread {
		position: relative;
		padding-left: var(--space-1);
	}
</style>
