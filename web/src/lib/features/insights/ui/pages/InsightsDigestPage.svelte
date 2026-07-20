<script lang="ts">
	import type { Provenance, Session } from '$lib/features/viewers';
	import { fmtK, type InsightScope } from '$lib/features/viewers';
	import { dumbZoneOption } from '$lib/features/viewers';
	import { Button, Row, Spacer, Text } from '$lib/design-system';
	import { Chart } from '$lib/features/viewers';
	import FindingCard from '../molecules/FindingCard.svelte';
	import InsightEmptyState from '../molecules/InsightEmptyState.svelte';
	import InsightSectionTitle from '../atoms/InsightSectionTitle.svelte';
	import ProvenanceStamp from '../molecules/ProvenanceStamp.svelte';
	import ThemeCard from '../molecules/ThemeCard.svelte';

	let {
		f,
		sc,
		onOpenWorkbench,
		now,
		themeStamp,
		onRegenerate
	}: {
		f: Session[];
		sc: InsightScope;
		onOpenWorkbench: (sessionId: string) => void;
		now: Date;
		themeStamp: Provenance;
		onRegenerate: () => void;
	} = $props();

	function jump(id: string) {
		onOpenWorkbench(id);
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
		<Button variant="pill" onclick={onRegenerate}>↻ Regenerate synthesis</Button>
	</Row>
	<div class="subtitle">
		<Text tone="muted">
			A generated read of this scope. Chips jump into the Workbench for the evidence.
		</Text>
	</div>
	<div class="findgrid">
		{#if topTheme}
			<FindingCard finding={{ icon: '◆', label: 'Dominant pattern', accent: '--accent' }}>
				<b>{topTheme.title}</b> — {topTheme.sessions.length} sessions. {topTheme.synthesis}
			</FindingCard>
		{/if}
		{#if sc.dza.threshold}
			<FindingCard finding={{ icon: '▽', label: 'Quality cliff', accent: '--inference-dumb-zone' }}>
				Output degrades past <b>~{fmtK(sc.dza.threshold)}</b> context tokens (median of
				{sc.dza.detected}/{sc.dza.total} sessions where degradation showed). Split long loops sooner.
			</FindingCard>
		{/if}
		{#if mostCC && mostCC[1] > 0}
			<FindingCard
				finding={{
					icon: '⤺',
					label: 'Most redirected',
					accent: '--inference-course-correction',
					jump: { ref: mostCC[0].id, label: 'See the turns →' }
				}}
				onJump={jump}
			>
				<b>{mostCC[0].title}</b> ({mostCC[0].id}) took <b>{mostCC[1]}</b> course-corrections to keep on
				track.
			</FindingCard>
		{/if}
		{#if noiseS}
			<FindingCard
				finding={{
					icon: '⌇',
					label: 'Input-noise waste',
					accent: '--inference-input-noise',
					jump: { ref: noiseS.id, label: 'See where →' }
				}}
				onJump={jump}
			>
				Garbled prompts cost turns in {sc.byType['input-noise']} places — e.g. <b>{noiseS.id}</b>.
			</FindingCard>
		{/if}
	</div>
	<InsightSectionTitle heading={{ label: 'Themes' }} />
	<div class="tlist">
		{#each sc.themes as t (t.id)}
			<ThemeCard
				title={t.title}
				synthesis={t.synthesis}
				sessionIds={t.sessions.map((session) => session.id)}
				onJump={jump}
			/>
		{:else}
			<Text tone="dim">No themes for this scope.</Text>
		{/each}
	</div>
	<InsightSectionTitle heading={{ label: 'Dumb-zone aggregate', suffix: '· deterministic' }} />
	{#if sc.dza.points.length === 0}
		<InsightEmptyState>No degradation detected in this scope.</InsightEmptyState>
	{:else}
		<Chart option={dumbZoneOption(sc.dza)} height={210} />
	{/if}
	<ProvenanceStamp provenance={themeStamp} {now} />
</div>

<style>
	.digest {
		max-width: none;
	}
	.subtitle {
		margin: 0 0 var(--space-6);
		max-width: 780px;
	}
	.findgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--space-5);
		margin-top: var(--space-3);
	}
	.tlist {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
</style>
