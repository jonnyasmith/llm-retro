<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AccentPanel, Button, type AccentToken } from '$lib/ui';

	export interface Finding {
		icon: string;
		label: string;
		accent: AccentToken;
		jump?: { ref: string; label: string };
	}

	let {
		finding,
		children,
		onJump
	}: { finding: Finding; children: Snippet; onJump?: (ref: string) => void } = $props();
</script>

<AccentPanel accent={finding.accent}>
	<div class="kind">{finding.icon} {finding.label}</div>
	<div class="body">
		{@render children()}
		{#if finding.jump && onJump}
			<Button
				variant="link"
				data-jump={finding.jump.ref}
				onclick={() => finding.jump && onJump?.(finding.jump.ref)}
			>
				{finding.jump.label}
			</Button>
		{/if}
	</div>
</AccentPanel>

<style>
	.kind {
		color: var(--accent-panel);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 5px;
	}
	.body {
		font-size: 13px;
		color: var(--muted);
	}
	.body :global(b),
	.body :global(strong) {
		color: var(--ink);
	}
</style>
