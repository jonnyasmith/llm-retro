<script lang="ts">
	import JobCard from '$lib/components/prototypes/JobCard.svelte';
	import JobStageLabel from '$lib/components/prototypes/JobStageLabel.svelte';
	import JobsIntro from '$lib/components/prototypes/JobsIntro.svelte';
	import { Col, Grid } from '$lib/ui';
	import { JOBS_BY_STAGE } from './data';

	const triggerJob = () => undefined;
	const runPipeline = () => undefined;
</script>

<div class="jobs">
	<JobsIntro onRunPipeline={runPipeline} />
	{#each JOBS_BY_STAGE as [stage, jobs] (stage)}
		<div class="stage">
			<JobStageLabel {stage} />
			<Grid cols={6}>
				{#each jobs as job (job.title)}
					<Col span={2}>
						<JobCard {job} onTrigger={triggerJob} />
					</Col>
				{/each}
			</Grid>
		</div>
	{/each}
</div>

<style>
	.jobs {
		max-width: 1040px;
	}
	.stage {
		margin-bottom: var(--space-7);
	}
</style>
