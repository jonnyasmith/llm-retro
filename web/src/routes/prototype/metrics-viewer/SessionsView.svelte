<script lang="ts">
	import type { Session } from './types';
	import type { Aggregate } from './aggregate';
	import { fmtK, fmtMin } from './aggregate';
	import { sparkOption } from './charts';
	import { useViewerState } from './viewerState.svelte';
	import Chart from './Chart.svelte';
	import SessionDetail from './SessionDetail.svelte';

	let { f, a }: { f: Session[]; a: Aggregate } = $props();

	const st = useViewerState();

	// Keep the selection inside the current filtered scope; default to the first.
	$effect(() => {
		if (!f.some((s) => s.id === st.selected)) {
			st.selected = f[0]?.id ?? null;
		}
	});

	const selected = $derived(f.find((s) => s.id === st.selected) ?? null);
</script>

<div class="md">
	<div class="md-list">
		<div class="md-agg">
			<div><div class="k">Sessions</div><div class="v">{a.sessions}</div></div>
			<div><div class="k">Tokens</div><div class="v">{fmtK(a.totalTokens)}</div></div>
			<div><div class="k">Turns</div><div class="v">{a.turns}</div></div>
			<div>
				<div class="k">Active time</div>
				<div class="v">{fmtMin(Math.round(a.activeMs / 60000))}</div>
			</div>
		</div>
		<div class="md-listhead">
			<span>Session</span><span class="spacer" style="flex:1"></span><span>latency</span>
		</div>
		<div class="md-rows">
			{#each f as s (s.id)}
				<div
					class="srow"
					class:sel={s.id === st.selected}
					onclick={() => (st.selected = s.id)}
					role="button"
					tabindex="0"
				>
					<div>
						<div class="top">
							<span class="badge {s.tool}">{s.tool}</span>
							<span class="title">{s.title}</span>
						</div>
						<div class="meta">
							{s.start.toISOString().slice(0, 10)} · {s.turns} turns · {fmtK(
								s.tokens.in + s.tokens.out
							)} tok · {fmtMin(s.durationMin)}{s.subagents.count
								? ` · ${s.subagents.count} sub`
								: ''}
						</div>
					</div>
					<div class="spark"><Chart option={sparkOption(s)} height={26} /></div>
				</div>
			{/each}
		</div>
	</div>
	<div class="md-detail">
		{#if selected}
			<SessionDetail session={selected} />
		{:else}
			<div class="muted">No session in scope.</div>
		{/if}
	</div>
</div>
