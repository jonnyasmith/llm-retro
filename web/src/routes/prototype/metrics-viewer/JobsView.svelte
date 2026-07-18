<script lang="ts">
	import { Row, Spacer, Text, Grid, Col, Card, CardTitle, CardHint, Badge, Button } from '$lib/ui';

	type Job = { stage: string; title: string; desc: string; last: string; st: string };

	const jobs: Job[] = [
		{
			stage: 'import',
			title: 'Import sessions',
			desc: 'Normalise Claude/Codex/pi transcripts → Postgres',
			last: '2h ago',
			st: 'idle'
		},
		{
			stage: 'analysis',
			title: 'Extract signals',
			desc: 'Derive the 8 deterministic Signals per session',
			last: '2h ago',
			st: 'idle'
		},
		{
			stage: 'analysis',
			title: 'Infer course-corrections',
			desc: 'LLM pass via agent CLI, headless in-container',
			last: 'never',
			st: 'idle'
		},
		{
			stage: 'analysis',
			title: 'Thematic synthesis',
			desc: 'Map-reduce over Signals + per-session Inferences',
			last: 'never',
			st: 'idle'
		}
	];

	const byStage: [string, Job[]][] = [];
	for (const j of jobs) {
		let entry = byStage.find(([s]) => s === j.stage);
		if (!entry) {
			entry = [j.stage, []];
			byStage.push(entry);
		}
		entry[1].push(j);
	}
</script>

<div style="max-width:1040px">
	<Row style="margin-bottom:6px">
		<h2 class="heading">Jobs</h2>
		<Spacer />
		<Button variant="pill">Run pipeline (import → analysis) →</Button>
	</Row>
	<Text tone="dim" style="display:block;margin:14px 0 18px">
		Self-describing job containers discovered by label (#5). The web app is the control plane —
		every run is an explicit action.
	</Text>
	{#each byStage as [name, list] (name)}
		<div style="margin-bottom:22px">
			<div class="group-label">{name}</div>
			<Grid cols={6}>
				{#each list as j (j.title)}
					<Col span={2}>
						<Card style="min-height:120px">
							<Row>
								<CardTitle style="text-transform:none;color:var(--ink);font-size:14px"
									>{j.title}</CardTitle
								>
								<Spacer />
								<Badge tone="neutral">{j.st}</Badge>
							</Row>
							<CardHint>{j.desc}</CardHint>
							<Row style="margin-top:auto">
								<Text tone="dim" style="font-size:11.5px">last run: {j.last}</Text>
								<Spacer />
								<Button variant="pill">Trigger →</Button>
							</Row>
						</Card>
					</Col>
				{/each}
			</Grid>
		</div>
	{/each}
</div>

<style>
	.heading {
		margin: 0;
		font-weight: 600;
		color: var(--ink);
	}
	.group-label {
		margin-bottom: 8px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--dim);
	}
</style>
