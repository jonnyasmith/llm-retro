import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Grid from './Grid.svelte';

const cells = createRawSnippet(() => ({
	render: () =>
		'<div style="display:contents"><div style="padding:16px;background:var(--panel)">One</div><div style="padding:16px;background:var(--panel)">Two</div><div style="padding:16px;background:var(--panel)">Three</div></div>'
}));

const meta = {
	title: 'Atoms/Grid',
	component: Grid,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { cols: 3, children: cells },
	parameters: { layout: 'padded' }
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;
export const EqualColumns: Story = {};
export const Mobile: Story = { parameters: { viewport: { defaultViewport: 'mobile' } } };
