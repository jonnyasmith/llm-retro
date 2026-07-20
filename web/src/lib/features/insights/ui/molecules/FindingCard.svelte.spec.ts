import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import FindingCard from './FindingCard.svelte';

describe('FindingCard', () => {
	it('renders finding content and emits its jump reference', async () => {
		const onJump = vi.fn();
		const children = createRawSnippet(() => ({
			render: () => '<strong>Session S-042 needed three redirects</strong>'
		}));

		render(FindingCard, {
			finding: {
				icon: '⤺',
				label: 'Most redirected',
				accent: '--inference-course-correction',
				jump: { ref: 'S-042', label: 'See the turns →' }
			},
			children,
			onJump
		});

		expect(screen.getByText('Session S-042 needed three redirects')).toBeDefined();

		await fireEvent.click(screen.getByRole('button', { name: 'See the turns →' }));

		expect(onJump).toHaveBeenCalledExactlyOnceWith('S-042');
	});
});
