<script lang="ts">
	import { fmtK, type Aggregate } from './aggregate';
	import { useViewerState } from './viewerState.svelte';
	import MetricsTopBar from '$lib/components/prototypes/MetricsTopBar.svelte';
	import type { MetricsView } from '$lib/components/prototypes/MetricsViewer.types';

	let { a }: { a: Aggregate } = $props();

	const st = useViewerState();

	const views: { value: MetricsView; label: string }[] = [
		{ value: 'overview', label: 'Overview' },
		{ value: 'sessions', label: 'Sessions' },
		{ value: 'insights', label: 'Insights' },
		{ value: 'jobs', label: 'Jobs' }
	];
</script>

<MetricsTopBar
	{views}
	view={st.view}
	onViewChange={(view) => (st.view = view)}
	sessions={a.sessions}
	tokens={fmtK(a.totalTokens)}
/>
