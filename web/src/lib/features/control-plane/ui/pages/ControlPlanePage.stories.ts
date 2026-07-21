import type { Meta, StoryObj } from '@storybook/sveltekit';
import ControlPlanePage from './ControlPlanePage.svelte';

const meta = {
	title: 'Pages/Control plane',
	component: ControlPlanePage,
	tags: ['autodocs', 'stable', 'ownership-feature-control-plane'],
	args: { health: { status: 'ok', database: 'connected' } },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof ControlPlanePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Disconnected: Story = {
	args: { health: { status: 'error', database: 'disconnected' } }
};
