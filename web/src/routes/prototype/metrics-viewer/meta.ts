// Presentation metadata shared across viewer components.
import type { InferenceType } from './types';

export const INFMETA: Record<InferenceType, { icon: string; label: string; color: string }> = {
	'course-correction': {
		icon: '⤺',
		label: 'Course-correction',
		color: 'var(--inference-course-correction)'
	},
	'input-noise': {
		icon: '⌇',
		label: 'Input-noise waste',
		color: 'var(--inference-input-noise)'
	},
	'dumb-zone': { icon: '▽', label: 'Dumb zone', color: 'var(--inference-dumb-zone)' }
};

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
