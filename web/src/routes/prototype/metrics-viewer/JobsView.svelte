<script lang="ts">
	type Job = { stage: string; title: string; desc: string; last: string; st: string };

	const jobs: Job[] = [
		{ stage: 'import', title: 'Import sessions', desc: 'Normalise Claude/Codex/pi transcripts → Postgres', last: '2h ago', st: 'idle' },
		{ stage: 'analysis', title: 'Extract signals', desc: 'Derive the 8 deterministic Signals per session', last: '2h ago', st: 'idle' },
		{ stage: 'analysis', title: 'Infer course-corrections', desc: 'LLM pass via agent CLI, headless in-container', last: 'never', st: 'idle' },
		{ stage: 'analysis', title: 'Thematic synthesis', desc: 'Map-reduce over Signals + per-session Inferences', last: 'never', st: 'idle' }
	];

	const byStage: [string, Job[]][] = [];
	for (const j of jobs) {
		let entry = byStage.find(([s]) => s === j.stage);
		if (!entry) {
			entry = [j.stage, []];
			byStage.push(entry);
		}
		entry[1].push(j);
	}
</script>

<div style="max-width:1040px">
	<div class="row" style="margin-bottom:6px">
		<h2 style="color:var(--ink)">Jobs</h2>
		<span class="spacer" style="flex:1"></span>
		<button class="pill on" style="cursor:pointer">Run pipeline (import → analysis) →</button>
	</div>
	<p class="dim" style="margin-bottom:18px">
		Self-describing job containers discovered by label (#5). The web app is the control plane — every run is an explicit action.
	</p>
	{#each byStage as [name, list] (name)}
		<div style="margin-bottom:22px">
			<div class="flabel" style="margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--dim)">{name}</div>
			<div class="grid">
				{#each list as j (j.title)}
					<div class="col2">
						<div class="card" style="min-height:120px">
							<div class="row">
								<h3 style="text-transform:none;color:var(--ink);font-size:14px">{j.title}</h3>
								<span class="spacer" style="flex:1"></span>
								<span class="badge" style="background:var(--panel2);color:var(--muted)">{j.st}</span>
							</div>
							<div class="hint">{j.desc}</div>
							<div class="row" style="margin-top:auto">
								<span class="dim" style="font-size:11.5px">last run: {j.last}</span>
								<span class="spacer" style="flex:1"></span>
								<button class="pill on" style="cursor:pointer">Trigger →</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
