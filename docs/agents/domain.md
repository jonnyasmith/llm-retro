# LLM Retro

A single-user work-tracking tool that reads the session logs written by the LLM coding harnesses the user runs (Claude, Codex, pi, omp) and turns them into behavioural usage metrics — how the user works over time, which models they reach for, and how many tokens that consumes. Monetary cost is out of scope; token usage is in scope.

## Language

**Harness**:
A coding tool that drives an LLM and writes its own session logs — currently Claude, Codex, pi, and omp. Each harness records at a different location and fidelity.
_Avoid_: Agent, tool, client, CLI.

**Session**:
One run of a single Harness in a single project, corresponding to one log file. A grouping dimension above Interaction; the count of Sessions is itself a metric of interest.
_Avoid_: Conversation, thread, chat, rollout.

**Interaction**:
One user prompt together with all model and tool activity it triggers, up to the next user prompt. Bounded by the user's inputs, not by the model's turns — a single Interaction may span many underlying log records and several model responses. The atomic unit of work the tool tracks; it carries the time (for hour/day metrics), the Model, and the token usage. Sub-agent activity the harness spawns is not its own Interaction; its tokens fold into the Interaction that spawned it, retained as a main-vs-sub-agent split.
_Avoid_: Turn, message, request, exchange, prompt.

**Model**:
The specific LLM that served an Interaction, named as the Harness reports it (e.g. `claude-opus-4-8`, `gpt-5.1-codex-max`). The "which models I reach for" dimension. Its provider (anthropic, openai, …) is a derived attribute, not the identity.
_Avoid_: LLM, engine, model family.

**Token usage**:
An Interaction's consumption expressed in four canonical buckets — `input`, `output`, `cache_read`, `cache_write` — normalised from whatever each Harness reports. A bucket a Harness does not report is null (absent), never zero; zero means genuinely zero.
_Avoid_: Cost, spend, credits, premium requests.

**Project**:
A git repository that work is attributed to — the first-class "what I was working on" dimension. Worktrees and subdirectories collapse into their parent repository, so every Interaction rolls up to exactly one Project regardless of the exact working directory it ran in. Identified by the local repository root path; the git remote URL is kept as a display attribute, not the identity.
_Avoid_: Repo, folder, directory, workspace, cwd.

**Ingestion**:
The process of reading new records from the Harnesses' log files and turning them into stored Interactions. Runs as a user-triggered background job from the app's Jobs screen — not a daemon and not automatic — and is safe to re-run.
_Avoid_: Import, sync, parse, scan, indexing.

**Checkpoint**:
The record of how far Ingestion has consumed each log file, so a re-run or a restart after failure resumes from where it stopped and never reprocesses an already-ingested record.
_Avoid_: Offset, cursor, watermark, bookmark.
