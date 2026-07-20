import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Row from './Row.svelte';

const content = createRawSnippet(() => ({
	render: () => '<span style="display:contents"><span>First</span><strong>Second</strong></span>'
}));
const meta = {
	title: 'Atoms/Row',
	component: Row,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content }
} satisfies Meta<typeof Row>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Centred: Story = {};
export const Baseline: Story = { args: { align: 'baseline' } };
