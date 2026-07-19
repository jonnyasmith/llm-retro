import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import SectionIntro from './SectionIntro.svelte';

describe('SectionIntro', () => {
	it('renders its heading, description, and composed content', () => {
		render(SectionIntro, {
			id: 'latency',
			heading: 'Is the model slower in the afternoon?',
			description: createRawSnippet(() => ({
				render: () => '<span>Per-response latency by hour.</span>'
			})),
			children: createRawSnippet(() => ({ render: () => '<span>Latency chart</span>' }))
		});

		expect(
			screen.getByRole('heading', { name: 'Is the model slower in the afternoon?' })
		).toBeDefined();
		expect(screen.getByText('Per-response latency by hour.')).toBeDefined();
		expect(screen.getByText('Latency chart')).toBeDefined();
	});
});
