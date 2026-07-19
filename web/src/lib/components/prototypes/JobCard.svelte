<script lang="ts">
	import { Badge, Button, Card, CardHint, CardTitle, Row, Spacer, Text } from '$lib/ui';
	import type { Job } from './JobCard.types';

	let { job, onTrigger }: { job: Job; onTrigger: () => void } = $props();
</script>

<Card style="min-height:120px">
	<Row>
		<CardTitle transform="none" style="color:var(--ink);font-size:14px">
			{job.title}
		</CardTitle>
		<Spacer />
		<Badge tone="neutral">{job.status}</Badge>
	</Row>
	<CardHint>{job.description}</CardHint>
	<Row style="margin-top:auto">
		<Text tone="dim" style="font-size:11.5px">last run: {job.lastRun}</Text>
		<Spacer />
		<Button variant="pill" onclick={onTrigger}>Trigger →</Button>
	</Row>
</Card>
