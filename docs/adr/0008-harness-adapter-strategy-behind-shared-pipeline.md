# Harness adapters are a strategy behind one shared ingest pipeline

Ingesting four Harnesses whose logs disagree on topology, identity, and structure could mean four parallel ingest jobs, each re-implementing the subtle correctness machinery (mid-read stability, checkpoint resume, archive, idempotent store writes). Instead, each Harness is a **strategy** behind a single harness-agnostic pipeline: the pipeline owns everything generic, and an adapter adapts only what is genuinely Harness-shaped.

## The seam

- **Adapter (per Harness) owns** — enumerating its source-file groups (its directory topology, and Codex's relocation into `archived_sessions`), deriving the `stableSessionId`, and parsing a text slice into a normalised Session (genuine-prompt detection, token extraction, sub-agent fold-up + main/sub split, the stable `interaction_key`).
- **Pipeline owns** — stable snapshot read (re-stat before/after to catch a file mutating mid-read), byte-offset checkpoint + incremental slice + resume-on-growth, raw archive, store writes (session/interaction/project upsert on the idempotency key), and cross-run dedup. Resumption included: the pipeline asks the adapter only which prompt boundary at or before the Checkpoint a resumed slice must start from, then slices once, so no adapter computes a slice of its own.

**Naming.** *Adapter* means the strategy object above and nothing else. The per-Harness module that knows one log format's record grammar — how to read a Session's metadata, find a prompt boundary, extract usage from a record — is a **log reader**, which the adapter delegates to. One adapter may share a log reader with another Harness whose wire format matches.

## The adapter set is a registry, but not everything Harness-shaped fits in it

The adapters are reached through one `Record<Harness, IngestAdapter>` registry, which is the pipeline's single entry point: job registration at startup and the HTTP ingest trigger both read it, and no caller names a Harness longhand. The exhaustive `Record` annotation is load-bearing — widening `Harness` without extending the registry is a compile error, which is what makes adding a Harness a registry entry plus an adapter rather than an edit spread across the tree.

Two facts about a Harness deliberately live outside that registry, and a reader who expects one home for everything should know why:

- **Its display label** is client-reachable — the Jobs, Sessions, and Models screens render it — so it sits with the other client-safe Harness contracts. The registry imports the filesystem and the store; pulling it into a browser bundle is not an option.
- **Its default Log sources** stay with the settings resolution in the store. Moving them onto the adapter would make the store import the registry, and the pipeline already imports the store to read settings — a runtime import cycle. The default-source record is independently exhaustive against `Harness`, so nothing is lost but locality.

## Absence is the null object

A Harness that lacks a capability adapts by returning emptiness the pipeline already swallows, reusing the domain rule "a bucket a Harness does not report is null, never zero". No sub-agents or sub-tokens not separately logged → `subTokens` all null; no `cache_write` (Codex) → that bucket null; no sub-agent files → an empty source-file-group list the generic loop iterates zero times. The pipeline therefore carries no `if (harness === …)` branch.

## Per-Harness Interaction modelling

The concrete adapter decisions the seam produced, each grilled against real logs on disk. They live here, not in the code, because they are the *why* behind otherwise surprising parsing choices.

**pi** — sub-agent tokens are never logged (a `subagent` toolResult is plain text: no `usage`, no nested assistant records, no agent marker), so `subTokens` is null (the null-object case) and the Interaction carries a **`spawnedSubagents`** flag marking its token total a floor, not a full accounting. Model is read directly off each assistant record's `message.model`; the separate `model_change` record is a redundant UI event and is ignored. A multi-model Interaction resolves to one Model by the serving-model rule (most output tokens wins). Genuine prompt = `message.role === "user"`; `interaction_key` = the message `id`.

**Codex** — a genuine `event_msg.user_message` opens the Interaction; following `turn_context` records are model-turn markers absorbed until the next prompt (ADR-0010). The first marker supplies Model and `cwd`, while `interaction_key` is its `turn_id` or, for older rollouts without one, the prompt timestamp. Injected user-role `response_item`s are not prompt boundaries. A per-turn `last_token_usage` delta counts only when the session-cumulative `total_token_usage` strictly advances, which exactly removes Codex's duplicated token records. Buckets are disjoint: `cache_read` = `cached_input_tokens`, `input` = `input_tokens − cached_input_tokens`, `output` = `output_tokens` (already includes reasoning), `cache_write` = null. `session.projectId` is the single shared Project or null when Interactions span repositories (ADR-0002).

**omp** — the raw wire format is pi-shaped rather than Claude-shaped: a leading `title` may precede the `session` record, and `message` records carry `role`, `model`, and `usage.{input,output,cacheRead,cacheWrite}`. Its Interaction semantics are nevertheless the Claude-twin case: `message.role === "user"` opens an Interaction, the message `id` is its `interaction_key`, and JSONL files recursively nested under the primary Session's same-named directory contain sub-agent activity. A `task` tool call's named children associate those files, including descendants, with the spawning Interaction; their assistant usage folds into `subTokens`, while primary-file assistant usage remains `mainTokens`. The derived `~/.omp/stats.db` is not a source.

## Considered options

- **Per-adapter monolith** — one ingest job per Harness. Rejected: it clones the mid-read/resume/archive/dedup logic (the code most likely to hide subtle bugs) four times, and each clone drifts.
- **Adapter reads its own files end-to-end** (pipeline is a bare job shell). Rejected: pushes checkpoint and idempotency correctness into every adapter for no gain, since that machinery is identical across append-only JSONL Harnesses.

## Consequences

- The contract is frozen against the outlier deliberately: pi is built concretely first, then Claude+pi are extracted into the pipeline, then Codex — the hardest Harness — is built immediately after the extract so any leak in the seam surfaces while it is still warm, with omp (the Claude-twin) last.
- Concerns that look cross-cutting but are Harness-specific stay inside the adapter: `token_count` cumulative-vs-delta correlation (Codex), where sub-agent tokens live (Claude sibling files, omp nested files, pi flat). The pipeline never learns of them.
