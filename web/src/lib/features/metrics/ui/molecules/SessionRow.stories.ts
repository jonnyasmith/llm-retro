import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import SessionRow from './SessionRow.svelte';

const meta = {
	title: 'Features/Metrics/SessionRow',
	component: SessionRow,
	tags: ['experimental', 'ownership-feature-metrics'],
	args: {
		session: {
			id: 'session-42',
			tool: 'codex',
			title: 'Migrate frontend architecture',
			start: new Date('2026-07-18T09:30:00Z'),
			turns: 28,
			totalTokens: 48200,
			durationMin: 74,
			subagentCount: 3
		},
		onselect: fn()
	}
} satisfies Meta<typeof SessionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
