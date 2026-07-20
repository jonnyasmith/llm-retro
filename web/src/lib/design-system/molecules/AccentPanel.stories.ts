import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import AccentPanel from './AccentPanel.svelte';

const content = createRawSnippet(() => ({
	render: () =>
		'<div><strong>Course correction</strong><p>Clarify the acceptance criteria.</p></div>'
}));
const meta = {
	title: 'Molecules/AccentPanel',
	component: AccentPanel,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { accent: '--warn', children: content }
} satisfies Meta<typeof AccentPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {};
export const CompactSecondary: Story = { args: { density: 'compact', surface: 'secondary' } };
