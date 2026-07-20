import type { Meta, StoryObj } from '@storybook/sveltekit';
import { expect, fn, userEvent, within } from 'storybook/test';
import { createRawSnippet } from 'svelte';
import SelectableRow from './SelectableRow.svelte';

const content = createRawSnippet(() => ({ render: () => '<span>Session from Codex</span>' }));
const meta = {
	title: 'Atoms/SelectableRow',
	component: SelectableRow,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content, onselect: fn(), selected: false }
} satisfies Meta<typeof SelectableRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const KeyboardSelection: Story = {
	play: async ({ canvasElement, args }) => {
		const row = within(canvasElement).getByRole('button');
		row.focus();
		await userEvent.keyboard('{Enter}');
		await expect(args.onselect).toHaveBeenCalledOnce();
	}
};
