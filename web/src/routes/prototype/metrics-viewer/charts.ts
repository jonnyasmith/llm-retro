// Pure ECharts option builders. No echarts runtime import here (type-only), so
// these stay cheap and SSR-safe; Chart.svelte owns the actual init/dispose.

import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import {
	fmtK,
	fmtMin,
	hourSeries,
	type Aggregate,
	type DumbZoneAggregate,
	type LatencyMode
} from './aggregate';
import type { Session } from './types';

const AX = { text: '#8b98a5', line: '#2a323d', split: '#1c232d' };
const baseGrid = { left: 44, right: 16, top: 24, bottom: 28 };
const axStyle = {
	axisLine: { lineStyle: { color: AX.line } },
	axisLabel: { color: AX.text, fontSize: 11 },
	splitLine: { lineStyle: { color: AX.split } }
};
const TOOL_COLOR: Record<string, string> = { claude: '#d97757', codex: '#10a37f', pi: '#a371f7' };

export function latencyHourOption(a: Aggregate, mode: LatencyMode): EChartsOption {
	const data = hourSeries(a, mode);
	return {
		grid: baseGrid,
		tooltip: { trigger: 'axis' },
		xAxis: {
			type: 'category',
			data: [...Array(24).keys()].map((h) => String(h).padStart(2, '0')),
			...axStyle,
			name: 'hour (Europe/London)',
			nameLocation: 'middle',
			nameGap: 32,
			nameTextStyle: { color: AX.text, fontSize: 10 }
		},
		yAxis: {
			type: 'value',
			...axStyle,
			name: mode === 'perToken' ? 'ms / output-token' : 'avg latency (s)',
			nameTextStyle: { color: AX.text, fontSize: 10 }
		},
		series: [
			{
				type: 'bar',
				data,
				itemStyle: {
					color: (p) => (p.dataIndex >= 13 && p.dataIndex <= 17 ? '#d29922' : '#4c8dff'),
					borderRadius: [3, 3, 0, 0]
				}
			}
		]
	};
}

export function modelMixOption(a: Aggregate): EChartsOption {
	const data = Object.entries(a.modelTokens).map(([m, v]) => ({ name: m, value: Math.round(v) }));
	return {
		tooltip: {
			trigger: 'item',
			formatter: (p) => {
				const d = p as CallbackDataParams;
				return `${d.name}<br>${fmtK(d.value as number)} tok · ${d.percent}%`;
			}
		},
		legend: { bottom: 0, textStyle: { color: AX.text, fontSize: 11 } },
		series: [
			{
				type: 'pie',
				radius: ['45%', '70%'],
				center: ['50%', '44%'],
				avoidLabelOverlap: true,
				label: { show: false },
				data,
				color: ['#4c8dff', '#7c5cff', '#3fb950', '#d29922', '#f85149', '#10a37f']
			}
		]
	};
}

export function toolsOption(a: Aggregate): EChartsOption {
	const ent = Object.entries(a.toolCounts).sort((x, y) => x[1] - y[1]);
	return {
		grid: { left: 60, right: 24, top: 10, bottom: 20 },
		tooltip: { trigger: 'axis' },
		xAxis: { type: 'value', ...axStyle },
		yAxis: { type: 'category', data: ent.map((e) => e[0]), ...axStyle },
		series: [
			{
				type: 'bar',
				data: ent.map((e) => e[1]),
				itemStyle: { color: '#10a37f', borderRadius: [0, 4, 4, 0] },
				barWidth: '60%'
			}
		]
	};
}

export function durationVsTurnsOption(sessions: readonly Session[]): EChartsOption {
	const byTool: Record<string, [number, number, string][]> = {};
	for (const s of sessions) (byTool[s.tool] ||= []).push([s.turns, s.durationMin, s.id]);
	return {
		grid: baseGrid,
		tooltip: {
			formatter: (p) => {
				const d = (p as CallbackDataParams).data as [number, number, string];
				return `${d[2]} · ${d[0]} turns · ${fmtMin(d[1])}`;
			}
		},
		legend: { top: 0, textStyle: { color: AX.text, fontSize: 11 } },
		xAxis: { type: 'value', name: 'turns', ...axStyle, nameTextStyle: { color: AX.text } },
		yAxis: { type: 'value', name: 'duration (min)', ...axStyle, nameTextStyle: { color: AX.text } },
		series: Object.entries(byTool).map(([t, d]) => ({
			name: t,
			type: 'scatter',
			data: d,
			symbolSize: 9,
			itemStyle: { color: TOOL_COLOR[t], opacity: 0.8 }
		}))
	};
}

export function subagentShareOption(a: Aggregate): EChartsOption {
	const rootTok = a.totalTokens - a.subTokens;
	return {
		tooltip: {
			trigger: 'item',
			formatter: (p) => {
				const d = p as CallbackDataParams;
				return `${d.name}<br>${fmtK(d.value as number)} tok · ${d.percent}%`;
			}
		},
		series: [
			{
				type: 'pie',
				radius: ['55%', '78%'],
				center: ['50%', '50%'],
				label: { show: false },
				data: [
					{ name: 'root sessions', value: Math.round(rootTok), itemStyle: { color: '#2a323d' } },
					{ name: 'subagents', value: Math.round(a.subTokens), itemStyle: { color: '#7c5cff' } }
				]
			}
		]
	};
}

export function sparkOption(s: Session): EChartsOption {
	return {
		grid: { left: 0, right: 0, top: 2, bottom: 2 },
		xAxis: { type: 'category', show: false, data: s.latency.map((_, i) => i) },
		yAxis: { type: 'value', show: false },
		series: [
			{
				type: 'line',
				data: s.latency.map((l) => l.ms),
				showSymbol: false,
				lineStyle: { width: 1.5, color: '#4c8dff' },
				areaStyle: { color: 'rgba(76,141,255,.15)' }
			}
		]
	};
}

export function dumbZoneOption(dza: DumbZoneAggregate): EChartsOption {
	const W = 20000;
	const MAX = 160000;
	const nb = MAX / W;
	const buckets = Array.from({ length: nb }, () => 0);
	for (const p of dza.points) {
		const i = Math.min(nb - 1, Math.floor(p / W));
		buckets[i]++;
	}
	const labels = buckets.map((_, i) => `${(i * W) / 1000}–${((i + 1) * W) / 1000}k`);
	return {
		grid: { left: 40, right: 20, top: 24, bottom: 42 },
		tooltip: { trigger: 'axis' },
		xAxis: {
			type: 'category',
			data: labels,
			axisLine: { lineStyle: { color: AX.line } },
			axisLabel: { color: AX.text, fontSize: 10, rotate: 30 },
			name: 'context tokens at degradation',
			nameLocation: 'middle',
			nameGap: 34,
			nameTextStyle: { color: AX.text, fontSize: 10 }
		},
		yAxis: {
			type: 'value',
			axisLabel: { color: AX.text },
			splitLine: { lineStyle: { color: AX.split } },
			name: 'sessions',
			nameTextStyle: { color: AX.text, fontSize: 10 }
		},
		series: [
			{
				type: 'bar',
				data: buckets,
				itemStyle: { color: '#e06c75', borderRadius: [3, 3, 0, 0] },
				markLine: dza.threshold
					? {
							symbol: 'none',
							label: {
								formatter: `threshold ~${fmtK(dza.threshold)}`,
								color: '#e2b341',
								position: 'insideEndTop',
								fontSize: 10
							},
							lineStyle: { color: '#e2b341', type: 'dashed' },
							data: [{ xAxis: Math.floor(dza.threshold / W) }]
						}
					: undefined
			}
		]
	};
}

export function gaugeOption(pct: number): EChartsOption {
	return {
		series: [
			{
				type: 'gauge',
				startAngle: 200,
				endAngle: -20,
				min: -30,
				max: 60,
				radius: '100%',
				center: ['50%', '70%'],
				progress: { show: true, width: 12 },
				axisLine: {
					lineStyle: {
						width: 12,
						color: [
							[0.5, '#3fb950'],
							[0.75, '#d29922'],
							[1, '#f85149']
						]
					}
				},
				pointer: { width: 4 },
				axisTick: { show: false },
				splitLine: { show: false },
				axisLabel: { show: false },
				detail: {
					formatter: (v: number) => (v > 0 ? '+' : '') + v.toFixed(0) + '%',
					fontSize: 18,
					color: '#e6edf3',
					offsetCenter: [0, '18%']
				},
				data: [{ value: pct }]
			}
		]
	};
}
