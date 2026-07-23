# LLM Retro

A single-user work-tracking tool that reads the session logs written by the LLM coding harnesses the user runs (Claude, Codex, pi, omp) and turns them into behavioural usage metrics — how the user works over time, which models they reach for, and how many tokens that consumes. Monetary cost is out of scope; token usage is in scope.

## Language

**Harness**:
A coding tool that drives an LLM and writes its own session logs — currently Claude, Codex, pi, and omp. Each harness records at a different location and fidelity.
_Avoid_: Agent, tool, client, CLI.

**Session**:
One run of a single Harness, corresponding to one log file. A grouping dimension above Interaction; the count of Sessions is itself a metric of interest. The backing log file may move on disk (for example, a completed Codex rollout moves into `archived_sessions`) without changing the Session or Checkpoint identity. `session.projectId` is nullable and derived from the Session's Interactions: it is their sole common Project only when every Interaction agrees, otherwise null means "heterogeneous — see the Interactions". Project attribution is authoritative at the Interaction, not the Session.
_Avoid_: Conversation, thread, chat, rollout.

**Interaction**:
One user prompt together with all model and tool activity it triggers, up to the next user prompt, requiring at least one assistant response. Bounded by the user's inputs, not by the model's turns — a single Interaction may span many underlying log records and several model responses. The atomic unit of work the tool tracks; it carries the time (for hour/day metrics), the Model, and the token usage. Sub-agent activity the harness spawns is not its own Interaction; its tokens fold into the Interaction that spawned it when the Harness records them, retained as a main-vs-sub-agent split. When a Harness such as pi records that sub-agents were spawned but omits their usage, sub-agent token buckets remain null and `spawnedSubagents` is true to disclose that the Interaction total is a floor. Each Interaction has a stable **interaction key** — an identifier the Harness's adapter supplies that survives re-ingest — used with its Session to recognise the same Interaction across runs; what serves as that key differs by Harness (pi genuine user message `id`; Codex `turn_context` `turn_id`).
_Avoid_: Turn, message, request, exchange, prompt.

**Model**:
The specific LLM that served an Interaction, canonicalised to one identity (e.g. `claude-opus-4-8`, `gpt-5.1-codex-max`) so the same model aggregates across Harnesses, with the verbatim string the Harness reported retained alongside as provenance. The "which models I reach for" dimension. Its provider (anthropic, openai, …) is a derived attribute, not the identity.
_Avoid_: LLM, engine, model family.

**Token usage**:
An Interaction's consumption expressed in four canonical buckets — `input`, `output`, `cache_read`, `cache_write` — normalised from whatever each Harness reports. A bucket a Harness does not report is null (absent), never zero; zero means genuinely zero.
_Avoid_: Cost, spend, credits, premium requests.

**Project**:
A git repository that work is attributed to — the first-class "what I was working on" dimension. Worktrees and subdirectories collapse into their parent repository, so every Interaction rolls up to exactly one Project regardless of the exact working directory it ran in. Identified by the local repository root path; the git remote URL is kept as a display attribute, not the identity.
_Avoid_: Repo, folder, directory, workspace, cwd.

**Ingestion**:
The process of reading new records from the Harnesses' log files and turning them into stored Interactions. One *kind* of Job — user-triggered from the app's Jobs screen, not a daemon and not automatic — and safe to re-run.
_Avoid_: Import, sync, parse, scan, indexing.

**Job**:
A unit of background work the app runs, identified by a type plus an optional scope (e.g. Ingestion of a single Harness, or a later analysis task). The runner runs Jobs of different identities concurrently but refuses a second Job of an identity already running. Ingestion is the first Job type; the concept is deliberately broader so future work (e.g. machine-learning over the stored data) is a new Job type, not a new mechanism.
_Avoid_: Task, worker, process, cron.

**Job run**:
A single execution of a Job — the persisted record of one attempt, carrying its status through its lifecycle, its timing and outcome, and a correlation id that both tags its logs and names the stream a user watches its progress on. The history of Job runs is what the Jobs screen shows; a run left mid-flight by a crashed process is reconciled to interrupted and the user re-triggers it.
_Avoid_: Task, invocation, execution, session.

**Checkpoint**:
The record of how far Ingestion has consumed each log file, so a re-run or a restart after failure resumes from where it stopped and never reprocesses an already-ingested record.
_Avoid_: Offset, cursor, watermark, bookmark.
