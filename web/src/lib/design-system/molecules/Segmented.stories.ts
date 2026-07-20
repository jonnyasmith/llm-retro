import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import Segmented from './Segmented.svelte';

const meta = {
	title: 'Molecules/Segmented',
	component: Segmented,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: {
		label: 'Viewer',
		value: 'metrics',
		onchange: fn(),
		options: [
			{ value: 'metrics', label: 'Metrics' },
			{ value: 'insights', label: 'Insights' }
		]
	}
} satisfies Meta<typeof Segmented>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Inset: Story = {};
export const Outline: Story = { args: { variant: 'outline' } };
