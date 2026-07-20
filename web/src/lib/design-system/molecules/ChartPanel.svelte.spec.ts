import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import ChartPanel from './ChartPanel.svelte';

describe('ChartPanel', () => {
	it('renders its title, chart, and optional header controls', () => {
		render(ChartPanel, {
			title: 'Latency by hour',
			titleTransform: 'none',
			headerControls: createRawSnippet(() => ({ render: () => '<span>Per output-token</span>' })),
			children: createRawSnippet(() => ({ render: () => '<span>Chart slot</span>' }))
		});

		expect(screen.getByRole('heading', { name: 'Latency by hour' }).dataset.transform).toBe('none');
		expect(screen.getByText('Per output-token')).toBeDefined();
		expect(screen.getByText('Chart slot')).toBeDefined();
	});

	it('renders an untitled chart without adding a heading', () => {
		render(ChartPanel, {
			children: createRawSnippet(() => ({ render: () => '<span>Tool usage chart</span>' }))
		});

		expect(screen.queryByRole('heading')).toBeNull();
		expect(screen.getByText('Tool usage chart')).toBeDefined();
	});
});
