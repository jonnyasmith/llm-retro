<script lang="ts">
	import { allModels, type Aggregate } from './aggregate';
	import { ALL, TOOLS } from './data';
	import { useViewerState } from './viewerState.svelte';
	import MetricsFilterBar from '$lib/components/prototypes/MetricsFilterBar.svelte';

	let { a }: { a: Aggregate } = $props();

	const st = useViewerState();

	const models = allModels(ALL);
	const dateRanges = [
		{ value: 7, label: '7d' },
		{ value: 21, label: '21d' },
		{ value: 90, label: '90d' }
	];
</script>

<MetricsFilterBar
	tools={TOOLS}
	selectedTools={st.tools}
	onToggleTool={(tool) => st.toggleTool(tool)}
	{models}
	selectedModels={st.models}
	onToggleModel={(model) => st.toggleModel(model)}
	{dateRanges}
	days={st.days}
	onDaysChange={(days) => (st.days = days)}
	filteredSessions={a.sessions}
	totalSessions={ALL.length}
/>
