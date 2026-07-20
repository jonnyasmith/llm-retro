import type { AccentToken } from '$lib/design-system';
import type { InferenceType } from './Inference.types';

export const INFERENCE_PRESENTATION: Record<
	InferenceType,
	{ icon: string; label: string; accent: AccentToken }
> = {
	'course-correction': {
		icon: '⤺',
		label: 'Course-correction',
		accent: '--inference-course-correction'
	},
	'input-noise': {
		icon: '⌇',
		label: 'Input-noise waste',
		accent: '--inference-input-noise'
	},
	'dumb-zone': { icon: '▽', label: 'Dumb zone', accent: '--inference-dumb-zone' }
};
