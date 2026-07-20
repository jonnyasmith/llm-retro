import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import ChartPanel from './ChartPanel.svelte';

const content = createRawSnippet(() => ({
	render: () =>
		'<div role="img" aria-label="Placeholder chart" style="min-height:12rem;background:var(--panel2)"></div>'
}));
const controls = createRawSnippet(() => ({ render: () => '<span>7 days</span>' }));
const meta = {
	title: 'Molecules/ChartPanel',
	component: ChartPanel,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { title: 'Sessions by tool', children: content }
} satisfies Meta<typeof ChartPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Titled: Story = {};
export const WithHeaderControls: Story = { args: { headerControls: controls } };
