import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import AccentPanel from './AccentPanel.svelte';

describe('AccentPanel', () => {
	it('renders content with the selected accent token', () => {
		render(AccentPanel, {
			accent: '--inference-course-correction',
			children: createRawSnippet(() => ({ render: () => 'Redirected request' }))
		});

		const panel = screen.getByText('Redirected request');
		expect(panel.getAttribute('data-accent')).toBe('--inference-course-correction');
	});
});
