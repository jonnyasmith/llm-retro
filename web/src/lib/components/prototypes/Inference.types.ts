export type InferenceType = 'course-correction' | 'input-noise' | 'dumb-zone';

export interface Provenance {
	model: string;
	promptVersion: string;
	extractorVersion: string;
	ranAt: Date;
	rawResponseRef: string;
}

export interface Inference {
	id: string;
	type: InferenceType;
	sessionId: string;
	turnRef: number;
	messageRef: string;
	summary: string;
	evidence: string;
	correctedTo: string | null;
	confidence: number;
	authoritative: false;
	provenance: Provenance;
	/** Present only on dumb-zone Inferences: context tokens at degradation. */
	degradedAtTokens?: number;
}
