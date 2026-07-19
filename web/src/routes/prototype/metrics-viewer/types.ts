// Domain shapes for the metrics-viewer prototype. Mirror the domain vocabulary
// vocabulary (Session, Signal, Inference) but hold only what the mock viewer
// needs — this is provisional data, not the real Normalised Session Model.

import type { Inference } from '$lib/components/prototypes/Inference.types';

export type {
	Inference,
	InferenceType,
	Provenance
} from '$lib/components/prototypes/Inference.types';

export type ToolName = 'claude' | 'codex' | 'pi';

export type TokenBasis = 'exact' | 'reconstructed';

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
