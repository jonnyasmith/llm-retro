<script lang="ts">
	import { Button, Row, Spacer, Text } from '$lib/design-system';

	let { onRunPipeline }: { onRunPipeline: () => void } = $props();
</script>

<Row style="margin-bottom:var(--space-2)">
	<h2>Jobs</h2>
	<Spacer />
	<Button variant="pill" onclick={onRunPipeline}>Run pipeline (import → analysis) →</Button>
</Row>
<Text tone="dim" style="display:block;margin:14px 0 18px">
	Self-describing job containers discovered by label (#5). The web app is the control plane — every
	run is an explicit action.
</Text>

<style>
	h2 {
		margin: 0;
		font-weight: 600;
		color: var(--ink);
	}
</style>
