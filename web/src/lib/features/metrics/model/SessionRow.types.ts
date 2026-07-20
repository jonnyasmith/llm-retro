import type { ToolName } from './types';

export interface SessionRowSummary {
	id: string;
	title: string;
	tool: ToolName;
	start: Date;
	turns: number;
	totalTokens: number;
	durationMin: number;
	subagentCount: number;
}
