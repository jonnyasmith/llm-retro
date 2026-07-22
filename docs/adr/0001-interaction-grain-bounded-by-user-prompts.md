# Interaction is the grain, bounded by user prompts, with sub-agents folded up

The tool tracks behavioural usage across four Harnesses whose logs disagree on what a "turn" is. We chose the **Interaction** — one user prompt plus all model and tool activity it triggers, up to the next user prompt — as the atomic unit stored, rather than the Session (too coarse to carry model/token/time together) or the raw log record (too noisy; one prompt spans dozens). Interaction count therefore reflects *things the user initiated*.

## Consequences

- Sub-agent activity (Claude sidechains, omp non-`main` `agent_type`) has no user prompt behind it, so it is **not** its own Interaction: its tokens fold into the spawning Interaction, retained as a main-vs-sub-agent split. This keeps "interactions by hour/day" honest while keeping token totals complete.
- Each adapter must identify what a *genuine* user prompt is, excluding harness-injected user-role records (tool results, slash-command expansions, injected reminders). This is the hardest parsing problem and it directly drives the headline metric.
- **An Interaction requires at least one model (assistant) response.** A genuine user prompt that drives no model activity — a control slash-command like `/clear` or `/compact`, or a prompt abandoned before any response — is *not* stored as an Interaction. This excludes control commands structurally, without a per-Harness command denylist, and it is why `interaction.model` can be NOT NULL: every stored Interaction was served by a Model.
- Changing the grain later means re-deriving from the raw logs (a checkpoint reset + re-ingest), not a cheap migration.
