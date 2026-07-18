<script lang="ts">
	import { fmtK, type Aggregate } from './aggregate';
	import { useViewerState, type View } from './viewerState.svelte';
	import { Segmented, Spacer } from '$lib/ui';

	let { a }: { a: Aggregate } = $props();

	const st = useViewerState();

	const tabs: { view: View; label: string }[] = [
		{ view: 'overview', label: 'Overview' },
		{ view: 'sessions', label: 'Sessions' },
		{ view: 'insights', label: 'Insights' },
		{ view: 'jobs', label: 'Jobs' }
	];
</script>

<div class="topbar">
	<div class="brand"><span class="logo"></span> LLM Retro <small>· prototype</small></div>
	<Segmented
		variant="inset"
		label="View"
		options={tabs.map((t) => ({ value: t.view, label: t.label }))}
		value={st.view}
		onchange={(v) => (st.view = v)}
	/>
	<Spacer />
	<div class="scope-note">{a.sessions} sessions · {fmtK(a.totalTokens)} tokens in scope</div>
</div>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 12px 22px;
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
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
