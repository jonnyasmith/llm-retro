import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import InferenceCard from './InferenceCard.svelte';

describe('InferenceCard', () => {
	it('renders an Inference and emits its Turn reference', async () => {
		const onTurnClick = vi.fn();

		render(InferenceCard, {
			inference: {
				id: 'inf-1',
				type: 'course-correction',
				sessionId: 'S-001',
				turnRef: 7,
				messageRef: 'msg-7',
				summary: 'The request needed redirecting',
				evidence: 'Build the unrelated thing',
				correctedTo: 'Build the requested thing',
				confidence: 0.91,
				authoritative: false,
				provenance: {
					model: 'gpt-test',
					promptVersion: 'retro-v1',
					extractorVersion: '1.2.3',
					ranAt: new Date('2026-07-19T09:00:00Z'),
					rawResponseRef: 'raw-1'
				}
			},
			onTurnClick
		});

		expect(screen.getByText('The request needed redirecting')).toBeDefined();

		await fireEvent.click(screen.getByRole('button', { name: '→ Turn 7 · msg-7' }));

		expect(onTurnClick).toHaveBeenCalledExactlyOnceWith(7);
	});
});
