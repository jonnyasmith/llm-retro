<script lang="ts">
	import type { InferenceType, Provenance, Session, Theme } from '$lib/features/viewers';
	import { iScope } from '$lib/features/viewers';
	import InsightsBanner from '../organisms/InsightsBanner.svelte';
	import InsightsDigestPage from './InsightsDigestPage.svelte';
	import InsightsWorkbenchPage from './InsightsWorkbenchPage.svelte';
	import InsightsExplorerPage from './InsightsExplorerPage.svelte';

	export type InsightsPageVariant = 'digest' | 'workbench' | 'explorer';

	let {
		f,
		variant,
		selectedSessionId,
		selectedThemeId,
		onSelectSession,
		onSelectTheme,
		onOpenMetrics,
		onOpenVariant,
		onOpenWorkbenchTurn,
		themes,
		extractorVersion,
		now,
		themeStamp,
		themeTypes,
		onRegenerate
	}: {
		f: Session[];
		variant: InsightsPageVariant;
		selectedSessionId: string | null;
		selectedThemeId: string | null;
		onSelectSession: (sessionId: string) => void;
		onSelectTheme: (themeId: string) => void;
		onOpenMetrics: (sessionId: string) => void;
		onOpenVariant: (variant: InsightsPageVariant, sessionId?: string) => void;
		onOpenWorkbenchTurn: (sessionId: string, turnRef: number) => void;
		themes: readonly Theme[];
		extractorVersion: string;
		now: Date;
		themeStamp: Provenance;
		themeTypes: Readonly<Record<string, InferenceType>>;
		onRegenerate: () => void;
	} = $props();

	const sc = $derived(iScope(f, themes));
</script>

<div class="insights">
	<div class="banner">
		<InsightsBanner
			sessionCount={f.length}
			{extractorVersion}
			total={sc.totalInf}
			byType={sc.byType}
		/>
	</div>
	{#if variant === 'workbench'}
		<InsightsWorkbenchPage
			{f}
			selectedId={selectedSessionId}
			{onSelectSession}
			{onOpenMetrics}
			{now}
		/>
	{:else if variant === 'explorer'}
		<InsightsExplorerPage
			{f}
			{sc}
			{selectedThemeId}
			{onSelectTheme}
			{onOpenMetrics}
			{onOpenWorkbenchTurn}
			{now}
			{themeStamp}
			{themeTypes}
		/>
	{:else}
		<InsightsDigestPage
			{f}
			{sc}
			{now}
			{themeStamp}
			{onRegenerate}
			onOpenWorkbench={(sessionId) => onOpenVariant('workbench', sessionId)}
		/>
	{/if}
</div>

<style>
	.insights {
		/* Full-bleed like the other views; the cards below flow to fill the width. */
		max-width: none;
	}
	.banner {
		margin-bottom: 24px;
	}
</style>
