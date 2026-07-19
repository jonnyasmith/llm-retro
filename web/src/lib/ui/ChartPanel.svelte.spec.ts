import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import ChartPanel from './ChartPanel.svelte';

describe('ChartPanel', () => {
	it('renders its title, chart, and optional header controls', () => {
		render(ChartPanel, {
			title: 'Latency by hour',
			headerControls: createRawSnippet(() => ({ render: () => 'Per output-token' })),
			children: createRawSnippet(() => ({ render: () => 'Chart slot' }))
		});

		expect(screen.getByRole('heading', { name: 'Latency by hour' })).toBeDefined();
		expect(screen.getByText('Per output-token')).toBeDefined();
		expect(screen.getByText('Chart slot')).toBeDefined();
	});
});
