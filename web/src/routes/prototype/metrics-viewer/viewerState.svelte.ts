import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import type { MetricsView } from '$lib/components/prototypes/MetricsViewer.types';
import { TOOLS } from './data';
import type { LatencyMode } from './aggregate';
import type { ToolName } from './types';

/** Shared, reactive viewer state: header nav + filter bar + cross-view selection. */
export class ViewerState {
	view = $state<MetricsView>('overview');
	tools = new SvelteSet<ToolName>(TOOLS);
	models = new SvelteSet<string>();
	days = $state(21);
	/** Sessions-view master-detail selection. */
	selected = $state<string | null>(null);
	/** Insights per-session selection (Workbench). */
	insightSel = $state<string | null>(null);
	/** Insights Explorer theme selection. */
	themeSel = $state<string | null>(null);
	latencyMode = $state<LatencyMode>('raw');

	toggleTool(tool: ToolName): void {
		if (this.tools.has(tool)) this.tools.delete(tool);
		else this.tools.add(tool);
		// Empty selection reads as "all" — never filter everything out.
		if (this.tools.size === 0) for (const t of TOOLS) this.tools.add(t);
	}

	toggleModel(model: string): void {
		if (this.models.has(model)) this.models.delete(model);
		else this.models.add(model);
	}
}

const KEY = Symbol('metrics-viewer-state');

export function provideViewerState(): ViewerState {
	const state = new ViewerState();
	setContext(KEY, state);
	return state;
}

export function useViewerState(): ViewerState {
	return getContext<ViewerState>(KEY);
}
