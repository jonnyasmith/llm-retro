import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Banner from './Banner.svelte';

const content = createRawSnippet(() => ({
	render: () => '<span>Extraction is ready to run.</span>'
}));
const meta = {
	title: 'Molecules/Banner',
	component: Banner,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content }
} satisfies Meta<typeof Banner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Information: Story = {};
export const Warning: Story = { args: { tone: 'warn' } };
