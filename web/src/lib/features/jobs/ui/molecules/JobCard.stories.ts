import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import JobCard from './JobCard.svelte';

const meta = {
	title: 'Molecules/JobCard',
	component: JobCard,
	tags: ['experimental', 'ownership-feature-jobs'],
	args: {
		job: {
			stage: 'import',
			title: 'Import Sessions',
			description: 'Extract Signals from local Sessions.',
			lastRun: 'never',
			status: 'idle'
		},
		onTrigger: fn()
	}
} satisfies Meta<typeof JobCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Idle: Story = {};
export const Trigger: Story = {
	play: async ({ canvasElement, args }) => {
		await userEvent.click(within(canvasElement).getByRole('button', { name: /trigger/i }));
		await expect(args.onTrigger).toHaveBeenCalledOnce();
	}
};
