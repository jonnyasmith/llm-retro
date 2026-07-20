import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import InsightEmptyState from './InsightEmptyState.svelte';

const meta = {
	title: 'Features/Insights/InsightEmptyState',
	component: InsightEmptyState,
	tags: ['experimental', 'ownership-feature-insights']
} satisfies Meta<typeof InsightEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoInferences: Story = {
	args: {
		children: createRawSnippet(() => ({
			render: () => '<span>No Inferences were detected in this scope.</span>'
		}))
	}
};
