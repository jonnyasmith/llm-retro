<script lang="ts">
	import { Segmented, Spacer } from '$lib/ui';
	import type { MetricsView } from './MetricsViewer.types';

	let {
		views,
		view,
		onViewChange,
		sessions,
		tokens
	}: {
		views: ReadonlyArray<{ value: MetricsView; label: string }>;
		view: MetricsView;
		onViewChange: (view: MetricsView) => void;
		sessions: number;
		tokens: string;
	} = $props();
</script>

<div class="topbar">
	<div class="brand"><span class="logo"></span> LLM Retro <small>· prototype</small></div>
	<Segmented variant="inset" label="View" options={views} value={view} onchange={onViewChange} />
	<Spacer />
	<div class="scope-note">{sessions} sessions · {tokens} tokens in scope</div>
</div>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: var(--space-5) var(--space-7);
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		font-weight: 700;
		letter-spacing: 0.2px;
	}
	.brand .logo {
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: linear-gradient(135deg, var(--accent), var(--accent2));
	}
	.brand small {
		font-weight: 500;
		color: var(--dim);
	}
	.scope-note {
		font-size: 12px;
		color: var(--dim);
	}
</style>
