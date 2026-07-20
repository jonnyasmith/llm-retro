import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import { ALL } from '$lib/features/viewers/fixtures';
import { agg } from '$lib/features/viewers';
import MetricsOverviewPage from './MetricsOverviewPage.svelte';

const sessions = ALL.slice(0, 16);

const meta = {
	title: 'Pages/Metrics/Overview',
	component: MetricsOverviewPage,
	tags: ['experimental', 'ownership-feature-metrics'],
	parameters: { layout: 'fullscreen' },
	args: {
		f: sessions,
		a: agg(sessions),
		latencyMode: 'raw',
		onLatencyModeChange: fn(),
		onOpenInsights: fn(),
		onOpenSession: fn()
	}
} satisfies Meta<typeof MetricsOverviewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const PerOutputToken: Story = { args: { latencyMode: 'perToken' } };
export const Empty: Story = { args: { f: [], a: agg([]) } };
