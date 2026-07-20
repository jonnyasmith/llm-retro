import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Kpi from './Kpi.svelte';

const value = createRawSnippet(() => ({ render: () => '<span>42</span>' }));
const meta = {
	title: 'Atoms/Kpi',
	component: Kpi,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: value, unit: 'sessions' }
} satisfies Meta<typeof Kpi>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Neutral: Story = {};
export const Up: Story = { args: { delta: 'up' } };
export const Down: Story = { args: { delta: 'down' } };
