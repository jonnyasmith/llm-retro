import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import { ALL } from '$lib/features/viewers/fixtures';
import { agg } from '$lib/features/viewers';
import MetricsSessionsPage from './MetricsSessionsPage.svelte';

const sessions = ALL.slice(0, 12);

const meta = {
	title: 'Pages/Metrics/Sessions',
	component: MetricsSessionsPage,
	tags: ['experimental', 'ownership-feature-metrics'],
	parameters: { layout: 'fullscreen' },
	args: {
		f: sessions,
		a: agg(sessions),
		selectedId: sessions[0]?.id ?? null,
		latencyMode: 'raw',
		onSelectSession: fn(),
		onLatencyModeChange: fn(),
		onOpenInsights: fn()
	}
} satisfies Meta<typeof MetricsSessionsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};
export const Empty: Story = { args: { f: [], a: agg([]), selectedId: null } };
