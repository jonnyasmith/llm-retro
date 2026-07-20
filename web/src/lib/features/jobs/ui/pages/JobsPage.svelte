<script lang="ts">
	import JobCard from '../molecules/JobCard.svelte';
	import JobStageLabel from '../atoms/JobStageLabel.svelte';
	import JobsIntro from '../organisms/JobsIntro.svelte';
	import { Col, Grid } from '$lib/design-system';
	import type { Job, JobStage } from '$lib/features/viewers';

	let {
		jobsByStage,
		onTrigger,
		onRunPipeline
	}: {
		jobsByStage: ReadonlyArray<readonly [JobStage, readonly Job[]]>;
		onTrigger: (job: Job) => void;
		onRunPipeline: () => void;
	} = $props();
</script>

<div class="jobs">
	<JobsIntro {onRunPipeline} />
	{#each jobsByStage as [stage, jobs] (stage)}
		<div class="stage">
			<JobStageLabel {stage} />
			<Grid cols={6}>
				{#each jobs as job (job.title)}
					<Col span={2}>
						<JobCard {job} onTrigger={() => onTrigger(job)} />
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
