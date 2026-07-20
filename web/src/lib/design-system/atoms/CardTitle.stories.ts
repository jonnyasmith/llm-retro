import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import CardTitle from './CardTitle.svelte';

const content = createRawSnippet(() => ({ render: () => '<span>Sessions</span>' }));
const meta = {
	title: 'Atoms/CardTitle',
	component: CardTitle,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content }
} satisfies Meta<typeof CardTitle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Uppercase: Story = {};
export const NaturalCase: Story = { args: { transform: 'none' } };
