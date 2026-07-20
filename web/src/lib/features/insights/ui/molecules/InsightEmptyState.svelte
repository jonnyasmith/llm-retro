<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Text, type TextTone } from '$lib/design-system';

	let {
		tone = 'muted',
		spacing = 'panel',
		compact = false,
		children
	}: {
		tone?: TextTone;
		spacing?: 'panel' | 'thread' | 'none';
		compact?: boolean;
		children: Snippet;
	} = $props();
</script>

<Text {tone} class="empty" data-spacing={spacing} data-compact={compact}>
	{@render children()}
</Text>

<style>
	:global(.empty) {
		display: block;
	}
	:global(.empty[data-spacing='panel']) {
		padding: 24px;
	}
	:global(.empty[data-spacing='thread']) {
		padding: 18px 0;
	}
	:global(.empty[data-compact='true']) {
		font-size: 12px;
	}
</style>
