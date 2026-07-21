import type { Meta, StoryObj } from '@storybook/sveltekit';
import Spacer from './Spacer.svelte';

const meta = {
	title: 'Atoms/Spacer',
	component: Spacer,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	parameters: {
		docs: { description: { component: 'A flex-only spacer used between siblings in Row.' } }
	}
} satisfies Meta<typeof Spacer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
