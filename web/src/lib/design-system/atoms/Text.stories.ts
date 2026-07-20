import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Text from './Text.svelte';

const content = createRawSnippet(() => ({ render: () => '<span>Session metadata</span>' }));
const meta = {
	title: 'Atoms/Text',
	component: Text,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content }
} satisfies Meta<typeof Text>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Muted: Story = { args: { tone: 'muted' } };
export const Warning: Story = { args: { tone: 'warn' } };
export const Monospace: Story = { args: { mono: true } };
