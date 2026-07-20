<script lang="ts">
	import type { ECharts, EChartsOption } from 'echarts';
	import type { ECElementEvent } from 'echarts/types/dist/shared';

	let {
		option,
		height = 220,
		onpoint
	}: {
		option: EChartsOption;
		height?: number;
		onpoint?: (event: ECElementEvent) => void;
	} = $props();

	let el: HTMLDivElement;
	let instance = $state<ECharts | null>(null);

	// Init/dispose once. ECharts is browser-only and loaded lazily so the
	// renderer stays out of server rendering and non-chart entry chunks.
	$effect(() => {
		let disposed = false;
		let observer: ResizeObserver | undefined;
		void import('echarts').then((echarts) => {
			if (disposed) return;
			const chart = echarts.init(el, null, { renderer: 'canvas' });
			if (onpoint) chart.on('click', (event) => onpoint(event as ECElementEvent));
			observer = new ResizeObserver(() => chart.resize());
			observer.observe(el);
			instance = chart;
		});
		return () => {
			disposed = true;
			observer?.disconnect();
			instance?.dispose();
			instance = null;
		};
	});

	// Re-apply options whenever they change.
	$effect(() => {
		instance?.setOption(option, true);
	});
</script>

<div bind:this={el} class="chart" style="height:{height}px"></div>

<style>
	.chart {
		width: 100%;
	}
</style>
