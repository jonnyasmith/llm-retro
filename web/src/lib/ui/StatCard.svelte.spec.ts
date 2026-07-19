import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import StatCard from './StatCard.svelte';

describe('StatCard', () => {
	it('frames a figure with its label, unit, and supporting text', () => {
		render(StatCard, {
			label: 'Turn count',
			unit: 'turns',
			sub: 'Across the selected Sessions',
			delta: 'up',
			footer: createRawSnippet(() => ({ render: () => '<span>Trend chart</span>' })),
			children: createRawSnippet(() => ({ render: () => '42' }))
		});

		expect(screen.getByRole('heading', { name: 'Turn count' })).toBeDefined();
		expect(screen.getByText('42').getAttribute('data-delta')).toBe('up');
		expect(screen.getByText('turns')).toBeDefined();
		expect(screen.getByText('Across the selected Sessions')).toBeDefined();
		expect(screen.getByText('Trend chart')).toBeDefined();
	});
});
