import type { Meta, StoryObj } from '@storybook/sveltekit';
import Chart from './Chart.svelte';

const meta = {
	title: 'Features/Viewers/Chart',
	component: Chart,
	tags: ['experimental', 'ownership-feature-viewers'],
	args: {
		option: {
			xAxis: { type: 'category', data: ['Claude', 'Codex', 'Pi'] },
			yAxis: { type: 'value' },
			series: [{ type: 'bar', data: [42, 61, 27] }]
		},
		height: 260
	}
} satisfies Meta<typeof Chart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TokenVolume: Story = {};
