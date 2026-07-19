<script lang="ts">
	import { tick } from 'svelte';
	import type { Session } from './types';
	import { fmtK, type InsightScope } from './aggregate';
	import { NOW, THEME_STAMP, THEME_TYPE } from './data';
	import { INFMETA } from './meta';
	import { dumbZoneOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import { useVariants } from '$lib/prototype/variants.svelte';
	import { MasterDetail, SelectableRow, Text, Verdict } from '$lib/ui';
	import Chart from './Chart.svelte';
	import InferenceCard from '$lib/components/prototypes/InferenceCard.svelte';
	import InsightDetailHeader from '$lib/components/prototypes/InsightDetailHeader.svelte';
	import InsightEmptyState from '$lib/components/prototypes/InsightEmptyState.svelte';
	import InsightRailContent from '$lib/components/prototypes/InsightRailContent.svelte';
	import InsightRailHeader from '$lib/components/prototypes/InsightRailHeader.svelte';
	import InsightSectionTitle from '$lib/components/prototypes/InsightSectionTitle.svelte';
	import InsightSessionPanel from '$lib/components/prototypes/InsightSessionPanel.svelte';

	let { f, sc }: { f: Session[]; sc: InsightScope } = $props();

	const st = useViewerState();
	const vb = useVariants();

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

	async function showTurn(sessionId: string, turnRef: number) {
		st.insightSel = sessionId;
		vb.select('B');
		await tick();
		document
			.getElementById(`turn-${turnRef}`)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
</script>

<MasterDetail>
	{#snippet list()}
		<InsightRailHeader header={{ label: 'Pattern' }} />
		{#each items as it (it.id)}
			<SelectableRow
				layout="block"
				selected={st.themeSel === it.id}
				data-theme={it.id}
				onselect={() => (st.themeSel = it.id)}
			>
				<InsightRailContent
					entry={{
						title: it.title,
						metadata: `${it.id === 'DZ' ? 'deterministic aggregate' : 'thematic synthesis'} · ${it.n} sessions`
					}}
				/>
			</SelectableRow>
		{/each}
	{/snippet}
	{#snippet detail()}
		{#if st.themeSel === 'DZ'}
			<InsightDetailHeader heading="Dumb-zone threshold">
				{#snippet description()}
					Deterministic — distribution over per-session degradation points, no 2nd model pass.
				{/snippet}
			</InsightDetailHeader>
			{#if sc.dza.points.length === 0}
				<InsightEmptyState>No degradation detected in this scope.</InsightEmptyState>
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
			<InsightSectionTitle heading={{ label: 'Sessions behind it' }} />
			{#each dzRows as s (s.id)}
				<InsightSessionPanel
					session={{
						id: s.id,
						title: s.title,
						degradedAt: `~${fmtK(s.dumbZone!.degradedAtTokens ?? 0)} ctx`
					}}
					onMetrics={toMetrics}
				/>
			{:else}
				<Text tone="dim">none</Text>
			{/each}
		{:else}
			{@const t = sc.themes.find((x) => x.id === st.themeSel)}
			{#if !t}
				<Text tone="muted">Select a pattern.</Text>
			{:else}
				{@const type = THEME_TYPE[t.id]}
				<InsightDetailHeader heading={t.title} provenance={THEME_STAMP} now={NOW}>
					{#snippet description()}{t.synthesis}{/snippet}
				</InsightDetailHeader>
				<InsightSectionTitle
					heading={{
						label: `${t.sessions.length} sessions · supporting ${INFMETA[type].label.toLowerCase()} evidence`
					}}
				/>
				{#each t.sessions as s (s.id)}
					{@const rel = s.inferences.filter((i) => i.type === type)}
					<InsightSessionPanel
						session={{ id: s.id, title: s.title, tool: s.tool }}
						onMetrics={toMetrics}
					>
						{#if rel.length}
							{#each rel as inf, infIndex (inf.id)}
								<InferenceCard
									inference={inf}
									now={NOW}
									embedded
									embeddedAfterFirst={infIndex > 0}
									onTurnClick={(turnRef) => showTurn(inf.sessionId, turnRef)}
								/>
							{/each}
						{:else}
							<InsightEmptyState tone="dim" spacing="none" compact>
								matched on Signals — no per-turn Inference of this type
							</InsightEmptyState>
						{/if}
					</InsightSessionPanel>
				{/each}
			{/if}
		{/if}
	{/snippet}
</MasterDetail>
