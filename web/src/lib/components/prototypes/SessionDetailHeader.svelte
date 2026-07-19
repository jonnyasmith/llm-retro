<script lang="ts">
	import { Badge, Row, Segmented, Spacer, Text } from '$lib/ui';
	import type { SessionDetailSummary } from './Session.types';

	let {
		session,
		onOpenInsights
	}: {
		session: SessionDetailSummary;
		onOpenInsights: () => void;
	} = $props();
</script>

<Row>
	<Badge tone={session.tool}>{session.tool}</Badge>
	<h2>{session.title}</h2>
	<Spacer />
	<Segmented
		variant="inset"
		label="Session view"
		options={[
			{ value: 'metrics', label: 'Metrics' },
			{ value: 'insights', label: 'Open in Insights' }
		]}
		value="metrics"
		onchange={(value) => value === 'insights' && onOpenInsights()}
	/>
</Row>
<Text tone="muted" class="metadata">
	{session.id} · {session.start.toISOString().replace('T', ' ').slice(0, 16)} UTC · {session.kind}{session.kind ===
		'root' && session.subagentCount
		? ` · ${session.subagentCount} subagents`
		: ''}
</Text>

<style>
	h2 {
		font-size: 19px;
	}
	:global(.metadata) {
		display: block;
		margin-top: var(--space-1);
	}
</style>
