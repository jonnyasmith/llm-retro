import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import {
	ALL,
	EXTRACTOR_V,
	JOBS_BY_STAGE,
	NOW,
	THEMES,
	THEME_STAMP,
	THEME_TYPE,
	TOOLS
} from '$lib/features/viewers/fixtures';
import ViewerPage from './ViewerPage.svelte';

const meta = {
	title: 'Pages/Viewer',
	component: ViewerPage,
	tags: ['experimental', 'ownership-feature-viewer-shell'],
	parameters: { layout: 'fullscreen' },
	args: {
		sessions: ALL,
		view: 'overview',
		selectedTools: new Set(TOOLS),
		selectedModels: new Set<string>(),
		days: 21,
		selectedSessionId: ALL[0]?.id ?? null,
		selectedInsightSessionId: ALL[0]?.id ?? null,
		selectedThemeId: 'T1',
		insightsVariant: 'digest',
		latencyMode: 'raw',
		onViewChange: fn(),
		onToggleTool: fn(),
		onToggleModel: fn(),
		onDaysChange: fn(),
		onSelectSession: fn(),
		onSelectInsightSession: fn(),
		onSelectTheme: fn(),
		onInsightsVariantChange: fn(),
		onLatencyModeChange: fn(),
		now: NOW,
		themes: THEMES,
		extractorVersion: EXTRACTOR_V,
		themeStamp: THEME_STAMP,
		themeTypes: THEME_TYPE,
		jobsByStage: JOBS_BY_STAGE,
		onRegenerateInsights: fn(),
		onTriggerJob: fn(),
		onRunPipeline: fn()
	}
} satisfies Meta<typeof ViewerPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Sessions: Story = { args: { view: 'sessions' } };
export const InsightsDigest: Story = { args: { view: 'insights', insightsVariant: 'digest' } };
export const Jobs: Story = { args: { view: 'jobs' } };
export const EmptyScope: Story = {
	args: { sessions: [], selectedSessionId: null, selectedInsightSessionId: null }
};
export const MobileOverview: Story = {
	parameters: { viewport: { defaultViewport: 'mobile' } }
};
