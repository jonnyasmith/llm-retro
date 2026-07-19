export type JobStage = 'import' | 'analysis';
export type JobStatus = 'idle';

export interface Job {
	stage: JobStage;
	title: string;
	description: string;
	lastRun: string;
	status: JobStatus;
}
