import { INFERENCE_PRESENTATION } from '$lib/components/prototypes/Inference.presentation';

// Presentation metadata shared across viewer containers.
export const INFMETA = INFERENCE_PRESENTATION;

// The three Insights layouts, offered through the shared prototype VariantBar.
export const INSIGHT_VARIANTS: { id: string; label: string; description: string }[] = [
	{
		id: 'A',
		label: 'Digest',
		description: 'Opinionated retro report — headline findings first, least interactive.'
	},
	{
		id: 'B',
		label: 'Workbench',
		description: 'Session-first: annotated transcript, evidence attached to the Turn.'
	},
	{
		id: 'C',
		label: 'Explorer',
		description: 'Theme-first: patterns as primary objects, drill to their evidence.'
	}
];
