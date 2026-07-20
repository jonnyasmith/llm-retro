import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import { JOBS_BY_STAGE } from '$lib/features/viewers/fixtures';
import JobsPage from './JobsPage.svelte';

const meta = {
	title: 'Pages/Jobs',
	component: JobsPage,
	tags: ['experimental', 'ownership-feature-jobs'],
	parameters: { layout: 'padded' },
	args: { jobsByStage: JOBS_BY_STAGE, onTrigger: fn(), onRunPipeline: fn() }
} satisfies Meta<typeof JobsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
