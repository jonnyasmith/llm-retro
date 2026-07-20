import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Col from './Col.svelte';

const content = createRawSnippet(() => ({
	render: () => '<div style="padding:var(--space-6);background:var(--panel)">Spanning cell</div>'
}));
const meta = {
	title: 'Atoms/Col',
	component: Col,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { children: content, span: 2 }
} satisfies Meta<typeof Col>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TwoColumns: Story = {};
