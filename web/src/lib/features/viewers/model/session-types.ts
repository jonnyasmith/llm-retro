// Prop-driven Viewer shapes. These mirror the domain vocabulary but hold only
// what the UI needs; they are not the Normalised Session Model.

export type ToolName = 'claude' | 'codex' | 'pi';
export type TokenBasis = 'exact' | 'reconstructed';
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
	degradedAtTokens?: number;
}

export type JobStage = 'import' | 'analysis';
export type JobStatus = 'idle';
export interface Job {
	stage: JobStage;
	title: string;
	description: string;
	lastRun: string;
	status: JobStatus;
}

export interface LatencySample {
	instant: Date;
	ms: number;
	outTokens: number;
}

export interface Session {
	id: string;
	title: string;
	tool: ToolName;
	kind: 'root' | 'subagent';
	start: Date;
	durationMin: number;
	turns: number;
	/** model -> share of tokens (sums to 1). */
	mix: Record<string, number>;
	tokens: { in: number; out: number; cache: number; basis: TokenBasis };
	subagents: { count: number; tokens: number };
	/** tool name -> invocation count. */
	tools: Record<string, number>;
	latency: LatencySample[];
	activeMs: number;
	dominantModel: string;
	inferences: Inference[];
	/** The per-session dumb-zone Inference, or null when it never degraded. */
	dumbZone: Inference | null;
}

export interface Theme {
	id: string;
	title: string;
	synthesis: string;
	match: (session: Session) => boolean;
}

/** A Theme resolved against a filtered set — carries its matching sessions. */
export interface ResolvedTheme extends Theme {
	sessions: Session[];
}
