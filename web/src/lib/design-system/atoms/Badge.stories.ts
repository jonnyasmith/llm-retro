import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Badge from './Badge.svelte';

const label = createRawSnippet(() => ({ render: () => '<span>Codex</span>' }));
const meta = {
	title: 'Atoms/Badge',
	component: Badge,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: label, tone: 'neutral' }
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Neutral: Story = {};
export const Claude: Story = { args: { tone: 'claude' } };
export const Codex: Story = { args: { tone: 'codex' } };
export const Pi: Story = { args: { tone: 'pi' } };
