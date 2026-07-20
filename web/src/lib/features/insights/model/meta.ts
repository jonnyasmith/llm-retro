import { INFERENCE_PRESENTATION } from './Inference.presentation';

// Presentation metadata shared across viewer containers.
export const INFMETA = INFERENCE_PRESENTATION;

// Experimental page states captured as separate Storybook stories.
export const INSIGHT_VARIANTS: { id: string; label: string; description: string }[] = [
	{
		id: 'digest',
		label: 'Digest',
		description: 'Opinionated retro report — headline findings first, least interactive.'
	},
	{
		id: 'workbench',
		label: 'Workbench',
		description: 'Session-first: annotated transcript, evidence attached to the Turn.'
	},
	{
		id: 'explorer',
		label: 'Explorer',
		description: 'Theme-first: patterns as primary objects, drill to their evidence.'
	}
];
