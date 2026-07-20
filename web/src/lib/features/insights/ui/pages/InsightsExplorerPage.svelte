<script lang="ts">
	import type { InferenceType, Provenance, Session } from '$lib/features/viewers';
	import { fmtK, type InsightScope } from '$lib/features/viewers';
	import { INFMETA } from '../../model/meta';
	import { dumbZoneOption } from '$lib/features/viewers';
	import {
		MasterDetailTemplate as MasterDetail,
		SelectableRow,
		Text,
		Verdict
	} from '$lib/design-system';
	import { Chart } from '$lib/features/viewers';
	import InferenceCard from '../organisms/InferenceCard.svelte';
	import InsightDetailHeader from '../molecules/InsightDetailHeader.svelte';
	import InsightEmptyState from '../molecules/InsightEmptyState.svelte';
	import InsightRailContent from '../molecules/InsightRailContent.svelte';
	import InsightRailHeader from '../atoms/InsightRailHeader.svelte';
	import InsightSectionTitle from '../atoms/InsightSectionTitle.svelte';
	import InsightSessionPanel from '../organisms/InsightSessionPanel.svelte';

	let {
		f,
		sc,
		selectedThemeId,
		onSelectTheme,
		onOpenMetrics,
		onOpenWorkbenchTurn,
		now,
		themeStamp,
		themeTypes
	}: {
		f: Session[];
		sc: InsightScope;
		selectedThemeId: string | null;
		onSelectTheme: (themeId: string) => void;
		onOpenMetrics: (sessionId: string) => void;
		onOpenWorkbenchTurn: (sessionId: string, turnRef: number) => void;
		now: Date;
		themeStamp: Provenance;
		themeTypes: Readonly<Record<string, InferenceType>>;
	} = $props();

	const items = $derived([
		...sc.themes.map((t) => ({ id: t.id, title: t.title, n: t.sessions.length })),
		{ id: 'DZ', title: 'Dumb-zone threshold', n: sc.dza.detected }
	]);

	const dzRows = $derived(
		f
			.filter((s) => s.dumbZone)
			.sort((a, b) => (a.dumbZone!.degradedAtTokens ?? 0) - (b.dumbZone!.degradedAtTokens ?? 0))
	);
</script>

<MasterDetail>
	{#snippet list()}
		<InsightRailHeader header={{ label: 'Pattern' }} />
		{#each items as it (it.id)}
			<SelectableRow
				layout="block"
				selected={selectedThemeId === it.id}
				data-theme={it.id}
				onselect={() => onSelectTheme(it.id)}
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
		{#if selectedThemeId === 'DZ'}
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
					onMetrics={onOpenMetrics}
				/>
			{:else}
				<Text tone="dim">none</Text>
			{/each}
		{:else}
			{@const t = sc.themes.find((x) => x.id === selectedThemeId) ?? sc.themes[0]}
			{#if !t}
				<Text tone="muted">Select a pattern.</Text>
			{:else}
				{@const type = themeTypes[t.id]}
				<InsightDetailHeader heading={t.title} provenance={themeStamp} {now}>
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
						onMetrics={onOpenMetrics}
					>
						{#if rel.length}
							{#each rel as inf, infIndex (inf.id)}
								<InferenceCard
									inference={inf}
									{now}
									embedded
									embeddedAfterFirst={infIndex > 0}
									onTurnClick={(turnRef) => onOpenWorkbenchTurn(inf.sessionId, turnRef)}
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
