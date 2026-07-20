<script lang="ts">
	import {
		agg,
		allModels,
		filtered,
		type LatencyMode,
		type MetricsView,
		type Job,
		type JobStage,
		type Provenance,
		type Session,
		type Theme,
		type ToolName
	} from '$lib/features/viewers';
	import ViewerTopBar from '../organisms/ViewerTopBar.svelte';
	import ViewerFilterBar from '../organisms/ViewerFilterBar.svelte';
	import { MetricsOverviewPage } from '$lib/features/metrics';
	import { MetricsSessionsPage } from '$lib/features/metrics';
	import { InsightsPage, type InsightsPageVariant } from '$lib/features/insights';
	import { JobsPage } from '$lib/features/jobs';
	import { AppSurface } from '$lib/design-system';

	let {
		sessions,
		view,
		selectedTools,
		selectedModels,
		days,
		selectedSessionId,
		selectedInsightSessionId,
		selectedThemeId,
		insightsVariant,
		latencyMode,
		onViewChange,
		onToggleTool,
		onToggleModel,
		onDaysChange,
		onSelectSession,
		onSelectInsightSession,
		onSelectTheme,
		onInsightsVariantChange,
		onLatencyModeChange,
		now,
		themes,
		extractorVersion,
		themeStamp,
		themeTypes,
		jobsByStage,
		onRegenerateInsights,
		onTriggerJob,
		onRunPipeline
	}: {
		sessions: Session[];
		view: MetricsView;
		selectedTools: ReadonlySet<ToolName>;
		selectedModels: ReadonlySet<string>;
		days: number;
		selectedSessionId: string | null;
		selectedInsightSessionId: string | null;
		selectedThemeId: string | null;
		insightsVariant: InsightsPageVariant;
		latencyMode: LatencyMode;
		onViewChange: (view: MetricsView) => void;
		onToggleTool: (tool: ToolName) => void;
		onToggleModel: (model: string) => void;
		onDaysChange: (days: number) => void;
		onSelectSession: (sessionId: string) => void;
		onSelectInsightSession: (sessionId: string) => void;
		onSelectTheme: (themeId: string) => void;
		onInsightsVariantChange: (variant: InsightsPageVariant, sessionId?: string) => void;
		onLatencyModeChange: (mode: LatencyMode) => void;
		now: Date;
		themes: readonly Theme[];
		extractorVersion: string;
		themeStamp: Provenance;
		themeTypes: Readonly<Record<string, import('$lib/features/viewers').InferenceType>>;
		jobsByStage: ReadonlyArray<readonly [JobStage, readonly Job[]]>;
		onRegenerateInsights: () => void;
		onTriggerJob: (job: Job) => void;
		onRunPipeline: () => void;
	} = $props();

	const f = $derived(
		filtered(sessions, { tools: selectedTools, models: selectedModels, days, now })
	);
	const a = $derived(agg(f));
	const models = $derived(allModels(sessions));
	const views: { value: MetricsView; label: string }[] = [
		{ value: 'overview', label: 'Overview' },
		{ value: 'sessions', label: 'Sessions' },
		{ value: 'insights', label: 'Insights' },
		{ value: 'jobs', label: 'Jobs' }
	];
	const dateRanges = [
		{ value: 7, label: '7d' },
		{ value: 21, label: '21d' },
		{ value: 90, label: '90d' }
	];
</script>

<AppSurface>
	<div class="app">
		<ViewerTopBar
			{views}
			{view}
			{onViewChange}
			sessions={a.sessions}
			tokens={`${Math.round(a.totalTokens / 1000)}k`}
		/>
		<ViewerFilterBar
			tools={['claude', 'codex', 'pi']}
			{selectedTools}
			{onToggleTool}
			{models}
			{selectedModels}
			{onToggleModel}
			{dateRanges}
			{days}
			{onDaysChange}
			filteredSessions={a.sessions}
			totalSessions={sessions.length}
		/>
		<div class="main">
			{#if view === 'overview'}
				<MetricsOverviewPage
					{f}
					{a}
					{latencyMode}
					{onLatencyModeChange}
					onOpenInsights={() => onViewChange('insights')}
					onOpenSession={(sessionId) => {
						onSelectSession(sessionId);
						onViewChange('sessions');
					}}
				/>
			{:else if view === 'sessions'}
				<MetricsSessionsPage
					{f}
					{a}
					selectedId={selectedSessionId}
					{latencyMode}
					{onSelectSession}
					{onLatencyModeChange}
					onOpenInsights={() => onViewChange('insights')}
				/>
			{:else if view === 'insights'}
				<InsightsPage
					{f}
					variant={insightsVariant}
					selectedSessionId={selectedInsightSessionId}
					{selectedThemeId}
					onSelectSession={onSelectInsightSession}
					{onSelectTheme}
					{themes}
					{extractorVersion}
					{now}
					{themeStamp}
					{themeTypes}
					onRegenerate={onRegenerateInsights}
					onOpenMetrics={(sessionId) => {
						onSelectSession(sessionId);
						onViewChange('sessions');
					}}
					onOpenVariant={onInsightsVariantChange}
					onOpenWorkbenchTurn={(sessionId) => {
						onSelectInsightSession(sessionId);
						onInsightsVariantChange('workbench', sessionId);
					}}
				/>
			{:else}
				<JobsPage {jobsByStage} onTrigger={onTriggerJob} {onRunPipeline} />
			{/if}
		</div>
	</div>
</AppSurface>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}
	.main {
		flex: 1;
		padding: var(--space-7);
	}
	@media (max-width: 700px) {
		.main {
			padding: var(--space-5);
		}
	}
</style>
