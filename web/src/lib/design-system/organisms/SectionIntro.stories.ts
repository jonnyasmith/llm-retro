import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import SectionIntro from './SectionIntro.svelte';

const description = createRawSnippet(() => ({
	render: () => '<p>Compare deterministic Signals across Sessions.</p>'
}));
const content = createRawSnippet(() => ({
	render: () => '<div style="min-height:8rem;background:var(--panel)">Section content</div>'
}));
const meta = {
	title: 'Organisms/SectionIntro',
	component: SectionIntro,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { id: 'metrics', heading: 'Metrics view', description, children: content },
	parameters: { layout: 'padded' }
} satisfies Meta<typeof SectionIntro>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
