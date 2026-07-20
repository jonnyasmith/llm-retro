import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import CardHint from './CardHint.svelte';

describe('CardHint', () => {
	it('renders an italic hint when requested', () => {
		render(CardHint, {
			italic: true,
			children: createRawSnippet(() => ({ render: () => '<span>Click a point</span>' }))
		});

		expect(
			screen.getByText('Click a point').closest('[data-italic]')?.getAttribute('data-italic')
		).toBe('true');
	});
});
