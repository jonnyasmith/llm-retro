import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import Badge from './Badge.svelte';

describe('Badge', () => {
	it('renders its label', () => {
		render(Badge, {
			children: createRawSnippet(() => ({ render: () => '<span>Codex</span>' }))
		});

		expect(screen.getByText('Codex')).toBeDefined();
	});
});
