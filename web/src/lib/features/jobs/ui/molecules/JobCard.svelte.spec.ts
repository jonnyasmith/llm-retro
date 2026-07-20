import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import JobCard from './JobCard.svelte';

describe('JobCard', () => {
	it('renders a job and emits a trigger interaction', async () => {
		const onTrigger = vi.fn();

		render(JobCard, {
			job: {
				stage: 'analysis',
				title: 'Extract signals',
				description: 'Derive the deterministic Signals for each Session',
				lastRun: '2h ago',
				status: 'idle'
			},
			onTrigger
		});

		expect(screen.getByRole('heading', { name: 'Extract signals' })).toBeDefined();
		expect(screen.getByText('Derive the deterministic Signals for each Session')).toBeDefined();
		expect(screen.getByText('idle')).toBeDefined();
		expect(screen.getByText('last run: 2h ago')).toBeDefined();

		await fireEvent.click(screen.getByRole('button', { name: 'Trigger →' }));

		expect(onTrigger).toHaveBeenCalledOnce();
	});
});
