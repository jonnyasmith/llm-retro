export type ToolName = 'claude' | 'codex' | 'pi';

export type TokenBasis = 'exact' | 'reconstructed';

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
