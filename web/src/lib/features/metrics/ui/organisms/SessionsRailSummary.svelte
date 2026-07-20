<script lang="ts">
	import { Spacer } from '$lib/design-system';
	import type { SessionsRailStats } from '../../model/types';

	let { sessions, tokens, turns, activeTime }: SessionsRailStats = $props();
</script>

<div class="summary">
	<div>
		<div class="label">Sessions</div>
		<div class="value">{sessions}</div>
	</div>
	<div>
		<div class="label">Tokens</div>
		<div class="value">{tokens}</div>
	</div>
	<div>
		<div class="label">Turns</div>
		<div class="value">{turns}</div>
	</div>
	<div>
		<div class="label">Active time</div>
		<div class="value">{activeTime}</div>
	</div>
</div>
<div class="list-header"><span>Session</span><Spacer /><span>latency</span></div>

<style>
	.summary {
		padding: var(--space-5) var(--space-6);
		border-bottom: 1px solid var(--line);
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3) var(--space-6);
	}
	.label {
		font-size: 11px;
		color: var(--dim);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.value {
		font-size: 17px;
		font-weight: 700;
	}
	.list-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-6);
		border-bottom: 1px solid var(--line);
		font-size: 12px;
		color: var(--muted);
	}
</style>
