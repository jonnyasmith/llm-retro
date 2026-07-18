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

	// Init/dispose once (echarts is browser-only; loaded lazily so it never
	// enters the main bundle and only the dev-only prototype chunk pulls it).
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
