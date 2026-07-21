import type { Meta, StoryObj } from '@storybook/sveltekit';
import Chart from './Chart.svelte';

const meta = {
	title: 'Features/Viewers/Chart',
	component: Chart,
	tags: ['experimental', 'ownership-feature-viewers'],
	args: {
		option: {
			// Animation off for a deterministic frame under visual regression.
			animation: false,
			xAxis: { type: 'category', data: ['Claude', 'Codex', 'Pi'] },
			yAxis: { type: 'value' },
			series: [{ type: 'bar', data: [42, 61, 27] }]
		},
		height: 260
	},
	// Canvas renders after an async `import('echarts')`; let it paint before capture.
	parameters: { visual: { settleMs: 800 } }
} satisfies Meta<typeof Chart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TokenVolume: Story = {};
