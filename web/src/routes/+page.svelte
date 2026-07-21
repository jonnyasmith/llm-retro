<script lang="ts">
	import { ControlPlanePage } from '$lib/features/control-plane';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>LLM Retro</title>
	<meta name="description" content="Retro insights for AI coding Sessions" />
</svelte:head>

<ControlPlanePage health={data.health} />
