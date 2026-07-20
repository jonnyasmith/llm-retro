<script lang="ts">
	import type { InferenceType, Session } from '$lib/features/viewers';
	import { fmtK, fmtMin } from '$lib/features/viewers';
	import { INFMETA } from '../../model/meta';
	import {
		Button,
		MasterDetailTemplate as MasterDetail,
		SelectableRow,
		Text
	} from '$lib/design-system';
	import { INFERENCE_PRESENTATION } from '../../model/Inference.presentation';
	import InsightDetailHeader from '../molecules/InsightDetailHeader.svelte';
	import InsightEmptyState from '../molecules/InsightEmptyState.svelte';
	import InsightRailContent from '../molecules/InsightRailContent.svelte';
	import TranscriptTurn from '../organisms/TranscriptTurn.svelte';

	let {
		f,
		selectedId,
		onSelectSession,
		onOpenMetrics,
		now
	}: {
		f: Session[];
		selectedId: string | null;
		onSelectSession: (sessionId: string) => void;
		onOpenMetrics: (sessionId: string) => void;
		now: Date;
	} = $props();

	const rail = $derived([...f].sort((a, b) => b.inferences.length - a.inferences.length));
	const sel = $derived(f.find((s) => s.id === selectedId) ?? f[0]);

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
</script>

<MasterDetail>
	{#snippet list()}
		{#each rail as s (s.id)}
			<SelectableRow
				layout="block"
				selected={s.id === sel?.id}
				data-isel={s.id}
				onselect={() => onSelectSession(s.id)}
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
					<Button variant="link" data-tometrics={sel.id} onclick={() => onOpenMetrics(sel.id)}
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
						<TranscriptTurn inference={it.inf} model={sel.dominantModel} gap={it.gapN} {now} />
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
