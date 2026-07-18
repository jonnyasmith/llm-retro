<script lang="ts">
	import type { Session } from './types';
	import { iScope } from './aggregate';
	import { EXTRACTOR_V } from './data';
	import { INSIGHT_VARIANTS } from './meta';
	import { useViewerState } from './viewerState.svelte';
	import { useVariants } from '$lib/prototype/variants.svelte';
	import InsightDigest from './InsightDigest.svelte';
	import InsightWorkbench from './InsightWorkbench.svelte';
	import InsightExplorer from './InsightExplorer.svelte';

	let { f }: { f: Session[] } = $props();

	const st = useViewerState();
	const vb = useVariants();

	// Register the A/B/C layouts with the shared floating VariantBar, and hide
	// them again when this view unmounts (the old in-page .iswitch is dropped).
	$effect(() => {
		vb.set(INSIGHT_VARIANTS);
		return () => vb.clear();
	});

	const variant = $derived(vb.current ?? 'A');
	const sc = $derived(iScope(f));

	// Default selections when the current ones fall outside this scope.
	$effect(() => {
		if (!f.find((s) => s.id === st.insightSel)) {
			const richest = [...f].sort((a, b) => b.inferences.length - a.inferences.length)[0];
			st.insightSel = (richest ?? f[0])?.id ?? null;
		}
		const themeIds = [...sc.themes.map((t) => t.id), 'DZ'];
		if (!st.themeSel || !themeIds.includes(st.themeSel)) st.themeSel = themeIds[0];
	});
</script>

<div class="insights">
	<div class="row nonauth-banner">
		<span class="nonauth">⚠ Model-derived · non-authoritative</span>
		<span class="dim">
			The LLM pass over the same {f.length} filtered sessions — Signals remain the source of truth.
			Extractor v{EXTRACTOR_V}.
		</span>
		<span class="spacer" style="flex:1"></span>
		<span class="dim pmono">
			{sc.totalInf} inferences · ⤺{sc.byType['course-correction']} ⌇{sc.byType['input-noise']} ▽{sc.byType[
				'dumb-zone'
			]}
		</span>
	</div>
	{#if variant === 'B'}
		<InsightWorkbench {f} {sc} />
	{:else if variant === 'C'}
		<InsightExplorer {f} {sc} />
	{:else}
		<InsightDigest {f} {sc} />
	{/if}
</div>
