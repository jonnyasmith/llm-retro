<script lang="ts">
	import { resolve } from '$app/paths';
	import { ControlPlanePage } from '$lib/features/control-plane';
</script>

<svelte:head>
	<title>LLM Retro</title>
	<meta name="description" content="Retro insights for AI coding Sessions" />
</svelte:head>

<ControlPlanePage healthHref={resolve('/api/health')} />
