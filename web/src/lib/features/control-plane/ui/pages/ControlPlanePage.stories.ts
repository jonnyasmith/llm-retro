import type { Meta, StoryObj } from '@storybook/sveltekit';
import ControlPlanePage from './ControlPlanePage.svelte';

const meta = {
	title: 'Pages/Control plane/Running',
	component: ControlPlanePage,
	tags: ['autodocs', 'stable', 'ownership-feature-control-plane'],
	args: { healthHref: '/api/health' },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof ControlPlanePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
