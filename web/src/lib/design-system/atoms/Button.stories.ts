import { expect, fn, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Button from './Button.svelte';

const label = createRawSnippet(() => ({ render: () => '<span>Continue</span>' }));

const meta = {
	title: 'Atoms/Button',
	component: Button,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: label, onclick: fn() }
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Solid: Story = { args: { variant: 'solid', size: 'md' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Link: Story = { args: { variant: 'link' } };
export const Pill: Story = { args: { variant: 'pill' } };
export const Small: Story = { args: { size: 'sm' } };
export const Disabled: Story = { args: { disabled: true } };
export const Interaction: Story = {
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button'));
		await expect(args.onclick).toHaveBeenCalledOnce();
	}
};
