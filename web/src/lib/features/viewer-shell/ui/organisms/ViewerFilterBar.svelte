<script lang="ts">
	import { Segmented, Spacer, Toggle } from '$lib/design-system';
	import type { ToolName } from '$lib/features/viewers';

	let {
		tools,
		selectedTools,
		onToggleTool,
		models,
		selectedModels,
		onToggleModel,
		dateRanges,
		days,
		onDaysChange,
		filteredSessions,
		totalSessions
	}: {
		tools: readonly ToolName[];
		selectedTools: ReadonlySet<ToolName>;
		onToggleTool: (tool: ToolName) => void;
		models: readonly string[];
		selectedModels: ReadonlySet<string>;
		onToggleModel: (model: string) => void;
		dateRanges: ReadonlyArray<{ value: number; label: string }>;
		days: number;
		onDaysChange: (days: number) => void;
		filteredSessions: number;
		totalSessions: number;
	} = $props();
</script>

<div class="filters">
	<div class="filter-group">
		<span class="filter-label">Tool</span>
		{#each tools as tool (tool)}
			<Toggle pressed={selectedTools.has(tool)} tone={tool} onclick={() => onToggleTool(tool)}>
				<span class="tool-dot" style="background:var(--{tool})"></span>{tool}
			</Toggle>
		{/each}
	</div>
	<div class="filter-group">
		<span class="filter-label">Model</span>
		{#each models as model (model)}
			<Toggle tone="model" pressed={selectedModels.has(model)} onclick={() => onToggleModel(model)}>
				{model}
			</Toggle>
		{/each}
	</div>
	<div class="filter-group">
		<span class="filter-label">Date</span>
		<Segmented
			variant="outline"
			label="Date range"
			options={dateRanges}
			value={days}
			onchange={onDaysChange}
		/>
	</div>
	<Spacer />
	<div class="filter-summary">
		Filtered: <b>{filteredSessions}</b>/{totalSessions} sessions · {selectedModels.size
			? [...selectedModels].join(', ')
			: 'all models'}
	</div>
</div>

<style>
	.filters {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
		padding: var(--space-4) var(--space-7);
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		position: sticky;
		top: 57px;
		z-index: 15;
	}
	.filter-group {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.filter-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--dim);
	}
	.tool-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.filter-summary {
		font-size: 12px;
		color: var(--dim);
	}
	.filter-summary b {
		color: var(--muted);
	}
	@media (max-width: 700px) {
		.filters {
			position: static;
			align-items: flex-start;
			gap: var(--space-4);
			padding: var(--space-4) var(--space-5);
		}
		.filter-group {
			min-width: 0;
			flex-wrap: wrap;
		}
		.filter-summary {
			width: 100%;
		}
	}
</style>
