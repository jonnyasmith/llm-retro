import type { Meta, StoryObj } from '@storybook/sveltekit';
import { createRawSnippet } from 'svelte';
import Link from './Link.svelte';

const label = createRawSnippet(() => ({
	render: () => '<span>Check database connectivity</span>'
}));

const meta = {
	title: 'Atoms/Link',
	component: Link,
	tags: ['autodocs', 'stable', 'ownership-shared'],
	args: { href: '/api/health', children: label }
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
