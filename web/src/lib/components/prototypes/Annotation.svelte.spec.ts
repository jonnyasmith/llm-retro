import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Annotation from './Annotation.svelte';

describe('Annotation', () => {
	it('renders the Inference annotation supplied by its container', () => {
		render(Annotation, {
			inference: {
				id: 'inf-2',
				type: 'input-noise',
				sessionId: 'S-002',
				turnRef: 3,
				messageRef: 'msg-3',
				summary: 'Dictation changed the requested file',
				evidence: 'Open fights.ts',
				correctedTo: 'Open flights.ts',
				confidence: 0.87,
				authoritative: false,
				provenance: {
					model: 'gpt-test',
					promptVersion: 'retro-v1',
					extractorVersion: '1.2.3',
					ranAt: new Date('2026-07-19T09:00:00Z'),
					rawResponseRef: 'raw-2'
				}
			}
		});

		expect(screen.getByText('Dictation changed the requested file')).toBeDefined();
		expect(screen.getByText('Open flights.ts')).toBeDefined();
	});
});
