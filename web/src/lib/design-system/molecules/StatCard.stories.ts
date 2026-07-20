import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import StatCard from './StatCard.svelte';

const value = createRawSnippet(() => ({ render: () => '<span>128</span>' }));
const footer = createRawSnippet(() => ({ render: () => '<small>Across all tools</small>' }));
const meta = {
	title: 'Molecules/StatCard',
	component: StatCard,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { label: 'Sessions', sub: 'In the selected period', children: value }
} satisfies Meta<typeof StatCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const IncreasingWithFooter: Story = { args: { delta: 'up', footer } };
