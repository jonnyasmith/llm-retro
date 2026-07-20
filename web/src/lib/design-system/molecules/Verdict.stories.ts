import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Verdict from './Verdict.svelte';

const content = createRawSnippet(() => ({
	render: () => '<span>The Session recovered after clearer constraints.</span>'
}));
const meta = {
	title: 'Molecules/Verdict',
	component: Verdict,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { label: 'Reads as →', children: content }
} satisfies Meta<typeof Verdict>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
