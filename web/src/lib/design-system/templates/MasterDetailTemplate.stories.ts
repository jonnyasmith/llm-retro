import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import MasterDetailTemplate from './MasterDetailTemplate.svelte';

const list = createRawSnippet(() => ({
	render: () => '<nav aria-label="Sessions" style="padding:16px">Session list</nav>'
}));
const detail = createRawSnippet(() => ({
	render: () =>
		'<article><h2 id="session-detail">Session detail</h2><p>Selected state</p><a href="#session-detail" style="color:var(--accent)">Return to detail heading</a></article>'
}));

const meta = {
	title: 'Templates/MasterDetailTemplate',
	component: MasterDetailTemplate,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { list, detail },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof MasterDetailTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Selected: Story = {};
export const NarrowViewport: Story = {
	parameters: { viewport: { defaultViewport: 'mobile' } }
};
