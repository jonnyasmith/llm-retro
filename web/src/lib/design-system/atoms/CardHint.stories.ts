import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import CardHint from './CardHint.svelte';

const content = createRawSnippet(() => ({ render: () => '<span>Last run two hours ago</span>' }));
const meta = {
	title: 'Atoms/CardHint',
	component: CardHint,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content }
} satisfies Meta<typeof CardHint>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Italic: Story = { args: { italic: true } };
