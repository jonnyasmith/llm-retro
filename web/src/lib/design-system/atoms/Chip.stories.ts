import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import { createRawSnippet } from 'svelte';
import Chip from './Chip.svelte';

const content = createRawSnippet(() => ({ render: () => '<span>opus-4</span>' }));
const meta = {
	title: 'Atoms/Chip',
	component: Chip,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content }
} satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Static: Story = {};
export const Interactive: Story = { args: { onclick: fn() } };
export const More: Story = { args: { variant: 'more' } };
