import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import SessionRow from './SessionRow.svelte';

describe('SessionRow', () => {
	it('renders a Session summary and emits its id when selected', async () => {
		const onselect = vi.fn();

		render(SessionRow, {
			session: {
				id: 'session-17',
				title: 'Extract Session signals',
				tool: 'codex',
				start: new Date('2026-07-19T09:30:00Z'),
				turns: 12,
				totalTokens: 18_400,
				durationMin: 42,
				subagentCount: 2
			},
			selected: true,
			onselect
		});

		expect(screen.getByText('codex')).toBeDefined();
		expect(screen.getByText('Extract Session signals')).toBeDefined();
		expect(screen.getByText('2026-07-19 · 12 turns · 18k tok · 42m · 2 sub')).toBeDefined();

		await fireEvent.click(screen.getByRole('button'));

		expect(onselect).toHaveBeenCalledOnce();
		expect(onselect).toHaveBeenCalledWith('session-17');
	});
});
