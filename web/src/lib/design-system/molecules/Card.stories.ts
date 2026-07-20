import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Card from './Card.svelte';

const content = createRawSnippet(() => ({
	render: () =>
		'<div><h3 style="margin:0">Signals</h3><p style="margin:0">Deterministic facts from Sessions.</p></div>'
}));
const meta = {
	title: 'Molecules/Card',
	component: Card,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content }
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
