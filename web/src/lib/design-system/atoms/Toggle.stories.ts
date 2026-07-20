import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import { createRawSnippet } from 'svelte';
import Toggle from './Toggle.svelte';

const content = createRawSnippet(() => ({ render: () => '<span>Codex</span>' }));
const meta = {
	title: 'Atoms/Toggle',
	component: Toggle,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content, pressed: false, onclick: fn() }
} satisfies Meta<typeof Toggle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Resting: Story = {};
export const Pressed: Story = { args: { pressed: true, tone: 'codex' } };
export const Disabled: Story = { args: { disabled: true } };
