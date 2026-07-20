import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import AppSurface from './AppSurface.svelte';

const content = createRawSnippet(() => ({
	render: () => '<main style="min-height:12rem;padding:var(--space-7)">Application surface</main>'
}));

const meta = {
	title: 'Atoms/AppSurface',
	component: AppSurface,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof AppSurface>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
