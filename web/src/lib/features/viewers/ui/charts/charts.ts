// ECharts option builders. No echarts runtime import here (type-only), so these
// stay cheap; Chart.svelte owns the actual init/dispose.

import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import {
	fmtK,
	fmtMin,
	hourSeries,
	type Aggregate,
	type DumbZoneAggregate,
	type LatencyMode
} from '../../model/aggregate';
import type { Session, ToolName } from '../../model/session-types';
import { chartColours } from './chartColours';

const baseGrid = { left: 44, right: 16, top: 24, bottom: 28 };

function axes(colours: ReturnType<typeof chartColours>) {
	return {
		axisLine: { lineStyle: { color: colours.line } },
		axisLabel: { color: colours.text, fontSize: 11 },
		splitLine: { lineStyle: { color: colours.backgroundSecondary } }
	};
}

export function latencyHourOption(a: Aggregate, mode: LatencyMode): EChartsOption {
	const colours = chartColours();
	const axStyle = axes(colours);
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
			nameTextStyle: { color: colours.text, fontSize: 10 }
		},
		yAxis: {
			type: 'value',
			...axStyle,
			name: mode === 'perToken' ? 'ms / output-token' : 'avg latency (s)',
			nameTextStyle: { color: colours.text, fontSize: 10 }
		},
		series: [
			{
				type: 'bar',
				data,
				itemStyle: {
					color: (p) => (p.dataIndex >= 13 && p.dataIndex <= 17 ? colours.warn : colours.accent),
					borderRadius: [3, 3, 0, 0]
				}
			}
		]
	};
}

export function modelMixOption(a: Aggregate): EChartsOption {
	const colours = chartColours();
	const data = Object.entries(a.modelTokens).map(([m, v]) => ({ name: m, value: Math.round(v) }));
	return {
		tooltip: {
			trigger: 'item',
			formatter: (p) => {
				const d = p as CallbackDataParams;
				return `${d.name}<br>${fmtK(d.value as number)} tok · ${d.percent}%`;
			}
		},
		legend: { bottom: 0, textStyle: { color: colours.text, fontSize: 11 } },
		series: [
			{
				type: 'pie',
				radius: ['45%', '70%'],
				center: ['50%', '44%'],
				avoidLabelOverlap: true,
				label: { show: false },
				data,
				color: [
					colours.accent,
					colours.accentSecondary,
					colours.good,
					colours.warn,
					colours.bad,
					colours.codex
				]
			}
		]
	};
}

export function toolsOption(a: Aggregate): EChartsOption {
	const colours = chartColours();
	const axStyle = axes(colours);
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
				itemStyle: { color: colours.codex, borderRadius: [0, 4, 4, 0] },
				barWidth: '60%'
			}
		]
	};
}

export function durationVsTurnsOption(sessions: readonly Session[]): EChartsOption {
	const colours = chartColours();
	const axStyle = axes(colours);
	const toolColour: Record<ToolName, string> = {
		claude: colours.claude,
		codex: colours.codex,
		pi: colours.pi
	};
	const byTool = new Map<ToolName, [number, number, string][]>();
	for (const session of sessions) {
		const values = byTool.get(session.tool) ?? [];
		values.push([session.turns, session.durationMin, session.id]);
		byTool.set(session.tool, values);
	}
	return {
		grid: baseGrid,
		tooltip: {
			formatter: (p) => {
				const d = (p as CallbackDataParams).data as [number, number, string];
				return `${d[2]} · ${d[0]} turns · ${fmtMin(d[1])}`;
			}
		},
		legend: { top: 0, textStyle: { color: colours.text, fontSize: 11 } },
		xAxis: { type: 'value', name: 'turns', ...axStyle, nameTextStyle: { color: colours.text } },
		yAxis: {
			type: 'value',
			name: 'duration (min)',
			...axStyle,
			nameTextStyle: { color: colours.text }
		},
		series: [...byTool].map(([tool, data]) => ({
			name: tool,
			type: 'scatter',
			data,
			symbolSize: 9,
			itemStyle: { color: toolColour[tool], opacity: 0.8 }
		}))
	};
}

export function subagentShareOption(a: Aggregate): EChartsOption {
	const colours = chartColours();
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
					{ name: 'root sessions', value: Math.round(rootTok), itemStyle: { color: colours.line } },
					{
						name: 'subagents',
						value: Math.round(a.subTokens),
						itemStyle: { color: colours.accentSecondary }
					}
				]
			}
		]
	};
}

export function sparkOption(s: Session): EChartsOption {
	const colours = chartColours();
	return {
		grid: { left: 0, right: 0, top: 2, bottom: 2 },
		xAxis: { type: 'category', show: false, data: s.latency.map((_, i) => i) },
		yAxis: { type: 'value', show: false },
		series: [
			{
				type: 'line',
				data: s.latency.map((l) => l.ms),
				showSymbol: false,
				lineStyle: { width: 1.5, color: colours.accent },
				areaStyle: { color: colours.accentArea }
			}
		]
	};
}

export function dumbZoneOption(dza: DumbZoneAggregate): EChartsOption {
	const colours = chartColours();
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
			axisLine: { lineStyle: { color: colours.line } },
			axisLabel: { color: colours.text, fontSize: 10, rotate: 30 },
			name: 'context tokens at degradation',
			nameLocation: 'middle',
			nameGap: 34,
			nameTextStyle: { color: colours.text, fontSize: 10 }
		},
		yAxis: {
			type: 'value',
			axisLabel: { color: colours.text },
			splitLine: { lineStyle: { color: colours.backgroundSecondary } },
			name: 'sessions',
			nameTextStyle: { color: colours.text, fontSize: 10 }
		},
		series: [
			{
				type: 'bar',
				data: buckets,
				itemStyle: { color: colours.dumbZone, borderRadius: [3, 3, 0, 0] },
				markLine: dza.threshold
					? {
							symbol: 'none',
							label: {
								formatter: `threshold ~${fmtK(dza.threshold)}`,
								color: colours.courseCorrection,
								position: 'insideEndTop',
								fontSize: 10
							},
							lineStyle: { color: colours.courseCorrection, type: 'dashed' },
							data: [{ xAxis: Math.floor(dza.threshold / W) }]
						}
					: undefined
			}
		]
	};
}

export function gaugeOption(pct: number): EChartsOption {
	const colours = chartColours();
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
							[0.5, colours.good],
							[0.75, colours.warn],
							[1, colours.bad]
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
					color: colours.ink,
					offsetCenter: [0, '18%']
				},
				data: [{ value: pct }]
			}
		]
	};
}
