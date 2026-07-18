// Pure aggregation + formatting helpers over the mock Session set. No DOM, no
// echarts — safe to import anywhere. Chart option builders live in charts.ts.

import { NOW, THEMES } from './data';
import type { InferenceType, ResolvedTheme, Session } from './types';

export const fmtK = (n: number): string =>
	n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : '' + n;
export const fmtMin = (m: number): string => (m >= 60 ? (m / 60).toFixed(1) + 'h' : m + 'm');

export interface FilterState {
	tools: ReadonlySet<string>;
	models: ReadonlySet<string>;
	days: number;
}

export function filtered(all: readonly Session[], state: FilterState): Session[] {
	const cut = new Date(NOW.getTime() - state.days * 86400000);
	return all.filter(
		(s) =>
			state.tools.has(s.tool) &&
			(state.models.size === 0 || Object.keys(s.mix).some((m) => state.models.has(m))) &&
			s.start >= cut
	);
}

export function allModels(all: readonly Session[]): string[] {
	const models = new Set<string>();
	for (const s of all) for (const m of Object.keys(s.mix)) models.add(m);
	return [...models].sort();
}

export interface HourBucket {
	sumMs: number;
	sumTok: number;
	n: number;
}
export interface Aggregate {
	sessions: number;
	turns: number;
	tokIn: number;
	tokOut: number;
	tokCache: number;
	reconShare: number;
	subCount: number;
	subTokens: number;
	totalTokens: number;
	durationMin: number;
	activeMs: number;
	modelTokens: Record<string, number>;
	toolCounts: Record<string, number>;
	latByHour: HourBucket[];
}

export function agg(sessions: readonly Session[]): Aggregate {
	const a: Aggregate = {
		sessions: sessions.length,
		turns: 0,
		tokIn: 0,
		tokOut: 0,
		tokCache: 0,
		reconShare: 0,
		subCount: 0,
		subTokens: 0,
		totalTokens: 0,
		durationMin: 0,
		activeMs: 0,
		modelTokens: {},
		toolCounts: {},
		latByHour: Array.from({ length: 24 }, () => ({ sumMs: 0, sumTok: 0, n: 0 }))
	};
	let reconTok = 0;
	for (const s of sessions) {
		a.turns += s.turns;
		a.tokIn += s.tokens.in;
		a.tokOut += s.tokens.out;
		a.tokCache += s.tokens.cache;
		const tt = s.tokens.in + s.tokens.out;
		a.totalTokens += tt;
		if (s.tokens.basis === 'reconstructed') reconTok += tt;
		a.subCount += s.subagents.count;
		a.subTokens += s.subagents.tokens;
		a.durationMin += s.durationMin;
		a.activeMs += s.activeMs;
		for (const [m, share] of Object.entries(s.mix)) a.modelTokens[m] = (a.modelTokens[m] || 0) + tt * share;
		for (const [t, c] of Object.entries(s.tools)) a.toolCounts[t] = (a.toolCounts[t] || 0) + c;
		for (const l of s.latency) {
			const h = (l.instant.getUTCHours() + 1) % 24;
			a.latByHour[h].sumMs += l.ms;
			a.latByHour[h].sumTok += l.outTokens;
			a.latByHour[h].n++;
		}
	}
	a.reconShare = a.totalTokens ? reconTok / a.totalTokens : 0;
	return a;
}

export type LatencyMode = 'raw' | 'perToken';

export function hourSeries(a: Aggregate, mode: LatencyMode): (number | null)[] {
	return a.latByHour.map((h) =>
		!h.n ? null : mode === 'perToken' ? +(h.sumMs / h.sumTok).toFixed(2) : +(h.sumMs / h.n / 1000).toFixed(2)
	);
}

export function avg(arr: (number | null)[]): number {
	const v = arr.filter((x): x is number => x != null);
	return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

export interface LatStats {
	afternoon: number;
	rest: number;
	slower: number;
}
export function latStats(a: Aggregate): LatStats {
	const ptH = hourSeries(a, 'perToken');
	const afternoon = avg(ptH.slice(13, 18));
	const rest = avg(ptH.filter((_, i) => i < 13 || i > 17));
	return { afternoon, rest, slower: rest ? (afternoon / rest - 1) * 100 : 0 };
}

export interface DumbZoneAggregate {
	points: number[];
	threshold: number | null;
	detected: number;
	total: number;
}
export function dumbZoneAggregate(sessions: readonly Session[]): DumbZoneAggregate {
	const pts = sessions
		.filter((s) => s.dumbZone)
		.map((s) => s.dumbZone!.degradedAtTokens as number)
		.sort((a, b) => a - b);
	const threshold = pts.length ? pts[Math.floor(pts.length / 2)] : null;
	return { points: pts, threshold, detected: pts.length, total: sessions.length };
}

export interface InsightScope {
	totalInf: number;
	byType: Record<InferenceType, number>;
	themes: ResolvedTheme[];
	dza: DumbZoneAggregate;
}
export function iScope(f: readonly Session[]): InsightScope {
	const totalInf = f.reduce((n, s) => n + s.inferences.length, 0);
	const byType: Record<InferenceType, number> = { 'course-correction': 0, 'input-noise': 0, 'dumb-zone': 0 };
	for (const s of f) for (const i of s.inferences) byType[i.type]++;
	const themes = THEMES.map((t) => ({ ...t, sessions: f.filter(t.match) })).filter((t) => t.sessions.length);
	return { totalInf, byType, themes, dza: dumbZoneAggregate(f) };
}

export function relTime(d: Date): string {
	const h = Math.round((NOW.getTime() - d.getTime()) / 3600000);
	return h < 1 ? 'just now' : h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}
