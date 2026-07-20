import type { ToolName } from '$lib/features/viewers';
export type { TokenBasis, ToolName } from '$lib/features/viewers';

export interface SessionDetailSummary {
	id: string;
	title: string;
	tool: ToolName;
	start: Date;
	kind: 'root' | 'subagent';
	subagentCount: number;
}

export interface SessionsRailStats {
	sessions: number;
	tokens: string;
	turns: number;
	activeTime: string;
}
