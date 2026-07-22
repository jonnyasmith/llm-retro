# Spec: First Harness end-to-end (Milestone 2 — proves the model)

Status: ready-for-agent

> The first vertical slice: get one Harness (Claude) from raw logs → normalised store → the first "how I work" views, with the raw archive protecting history from the moment ingest runs. Proves the S2 schema and the domain model against real data before adding breadth. Covers roadmap tickets S4–S7. Vocabulary is the project glossary (`docs/agents/domain.md`); decisions respect ADR-0001..0007.

## Problem Statement

The user runs four LLM coding Harnesses and has no unified view of how they work across them. Nothing yet turns any Harness's on-disk session logs into the behavioural metrics the tool exists to show — activity over time, model mix, project split, token usage. The store schema and job runner exist (Milestone 1) but no adapter has ever run against real logs, so the model is unproven.

## Solution

From the app, the user triggers a Claude ingest Job and watches it run to completion on a Jobs screen. Ingestion reads every Claude session log, normalises it into stored Interactions (with sub-agent tokens folded in and attributed to the right Project), checkpoints its progress so re-runs are cheap and idempotent, and — when enabled — archives the untouched raw files first so history is protected. The user then opens an Overview of headline totals and an Activity heatmap of local day-of-week × hour, seeing their first real "how I work" payoff on Claude data. Re-triggering ingest is safe and fast; only new or changed records are processed.

## User Stories

### Ingesting Claude logs (S4)

1. As the user, I want to trigger a Claude ingest, so that my Claude session logs become queryable behavioural data.
2. As the user, I want each genuine prompt I typed to count as exactly one Interaction, so that "interactions by hour/day" reflects things I initiated, not the model's internal turns.
3. As the user, I want tool results, injected reminders, and skill bodies excluded from prompt counting, so that my interaction counts aren't inflated by harness-injected noise.
4. As the user, I want slash-commands I typed to count as Interactions when they drive the model, so that real work started via a command isn't lost.
5. As the user, I want control commands like `/clear` and abandoned prompts to *not* count, so that the metric only reflects prompts that actually engaged a Model.
6. As the user, I want each Interaction's token usage split into input / output / cache_read / cache_write, so that I can see consumption in canonical buckets regardless of Harness.
7. As the user, I want a bucket a Harness never reported to read as absent rather than zero, so that I don't mistake "unknown" for "none".
8. As the user, I want sub-agent tokens folded into the Interaction that spawned them, retained as a main-vs-sub split, so that interaction counts stay honest while token totals stay complete.
9. As the user, I want nested sub-agents flattened into the top-level Interaction's sub bucket, so that deeply nested work still counts toward the prompt I initiated.
10. As the user, I want each Interaction attributed to one Model with the verbatim string retained, so that the same model aggregates across sessions while provenance is kept.
11. As the user, I want each Interaction attributed to one Project resolved from its working directory, so that I can later slice activity by what I was working on.
12. As the user, I want worktrees and subdirectories to collapse to their parent repository, so that one repo is one Project regardless of where the work ran.
13. As the user, I want work in a since-deleted or non-git directory kept and attributed to its literal path, so that real activity is never dropped just because the folder is gone.
14. As the user, I want each Interaction timestamped at the moment I sent the prompt, so that the activity heatmap reflects when I actually work.
15. As the user, I want re-running ingest to reprocess only new or changed records, so that repeated ingests are fast and never create duplicates.
16. As the user, I want an interrupted ingest to resume from where it stopped, so that a crash mid-run costs almost nothing to recover.

### Jobs screen (S5)

17. As the user, I want to start a Claude ingest from a Jobs screen, so that I don't need the command line.
18. As the user, I want to watch live progress — files done of total, the file in flight, a streaming log — so that I know ingest is working and how far along it is.
19. As the user, I want to see the terminal outcome (succeeded / failed / interrupted) of a run, so that I know whether my data is complete.
20. As the user, I want a history of past runs with their outcomes, so that I can see when I last ingested and whether it worked.
21. As the user, I want re-triggering an in-flight Claude ingest to attach to the running job rather than start a second one, so that I can't accidentally race two ingests over the same files.
22. As the user, I want a page reload to reattach to an in-flight run's progress, so that I don't lose visibility by refreshing.

### Overview & Activity views (S6)

23. As the user, I want an Overview of headline totals — total Interactions and total token usage, so that I get an at-a-glance sense of my Claude usage.
24. As the user, I want total token usage to combine main and sub-agent tokens, so that the headline reflects complete consumption.
25. As the user, I want an Activity heatmap of local day-of-week × hour, so that I can see the rhythm of when I work.
26. As the user, I want the heatmap bucketed in my configured timezone and correct across DST and fractional offsets, so that the picture of my day is accurate.
27. As the user, I want the heatmap to count Interactions, so that each bucket reflects prompts I initiated.

### Raw archive (S7)

28. As the user, I want ingest to archive untouched raw log files, so that my history survives a Harness pruning or rotating its logs.
29. As the user, I want the archive to include sub-agent files and mirror the source layout, so that the archived copy can be re-ingested later with a richer parser.
30. As the user, I want the archive to be toggleable and its path configurable, so that I can opt out of the disk cost.
31. As the user, I want archiving to happen before parsing, so that a parser failure still leaves my raw file safely copied.
32. As the user, I want ingest correctness to never depend on the archive, so that turning archiving off changes nothing about my metrics.

## Implementation Decisions

### The adapter contract and its seam

- A **Claude adapter** normalises raw Claude JSONL into the store's `Interaction`/`Session`/`Project` rows. It runs inside an **ingest Job handler** registered on the existing in-process job backend; the handler is the single primary test seam (temp DB + fixture log tree → asserted rows).
- **Job identity is harness-scoped: `type: 'ingest'`, `scope: 'claude'`** (ADR-0006's worked example). The per-identity concurrency guard refuses a second concurrent Claude ingest (the real same-files race) while leaving other identities free. Supersedes the S3 stub's per-file scope.
- The handler **discovers its own work at run time** from settings — no per-file payload; the trigger is a plain "ingest Claude now" with an empty body (mirrors the stub endpoint). Discovery enumerates `<claude source>/*/*.jsonl` for each configured Claude log source (`settings.logSourceOverrides.claude` falling back to the default), then each session's `subagents/*.jsonl` siblings. Sub-agent files are never enumerated as sessions.
- **Progress:** `filesTotal` = count of discovered *session* files; `filesDone` increments per fully-processed session; `currentFile` names the session in flight. Sub-agent files fold into their session's unit of work.

### Genuine-user-prompt detection (the Interaction boundary)

- A new Interaction opens at a `type:"user"` record where **all** hold: `isSidechain` not true, `isMeta` not true, and content is text (a string or a text block) — **not** a `tool_result`. Slash-commands qualify (the user typed them).
- **An Interaction requires at least one `assistant` response** before the next genuine prompt; a genuine prompt that drives no model activity (control commands like `/clear`, abandoned prompts) is **not stored** (ADR-0001). This is why `interaction.model` is NOT NULL and needs no schema change.
- `isMeta` / `tool_result` user records and the noise types (`attachment`, `system`, `mode`, `permission-mode`, `file-history-snapshot`, `last-prompt`) never open an Interaction; those following an open prompt fold into it. `last-prompt` is a dev-time validation oracle only (it carries prompt text the store does not keep — ADR-0003).
- **Idempotency:** the opening genuine-user record's id is stored as `openingUserRecordId`; `UNIQUE(sessionId, openingUserRecordId)` (existing S2 key) makes Interaction insertion idempotent across re-runs.

### Tokens and Model (main-agent side)

- **Bucket map:** `input ← input_tokens`, `output ← output_tokens`, `cache_read ← cache_read_input_tokens`, `cache_write ← cache_creation_input_tokens`. A bucket whose source key is absent is null, never zero.
- **Main tokens** = per-bucket sum across all of the Interaction's own non-sidechain `assistant` records.
- **Model** = the first assistant record's model in the Interaction; if records ever disagree, take the model with the most `output_tokens` (the "serving model"). Store the verbatim string as `modelRaw`; derive canonical `model` by stripping a `[…]` context suffix and a trailing `-YYYYMMDD` date (e.g. `claude-opus-4-8[1m]` → `claude-opus-4-8`, `claude-haiku-4-5-20251001` → `claude-haiku-4-5`).

### Sub-agent fold-up (main-vs-sub split)

- Current Claude writes sub-agents to sibling `<sessionId>/subagents/agent-<agentId>.jsonl` files (records flagged `isSidechain:true`, carrying `agentId` + parent `sessionId`); older logs may carry inline `isSidechain` records. The adapter handles both.
- **Attribution is per spawning Interaction.** The spawning `Agent` tool-use lives in exactly one Interaction; its tool_result carries the `agentId`, giving `agentId → spawning Interaction`. The sub-agent file's four token buckets sum into that Interaction's `sub*` columns.
- **Nested sub-agents flatten** into the top-level Interaction's `sub*` bucket; no depth retained. The sub-agent's Model is discarded (no sub-model column — ADR-0001).
- A sub-agent still running at ingest time (no completed tool_result to correlate) is **skipped** and folded on a later re-run — never guessed.

### Project resolution

- Resolve each distinct `cwd` to `{ rootPath, gitRemoteUrl }` via a **`cwd → repo-root` resolver** (the one new injected collaborator). The real resolver shells out to git: `rootPath = parent(absolute git-common-dir)` — a single rule that collapses both worktrees and plain clones to the main repo root — and `gitRemoteUrl = origin url or null`. Resolution is **memoised per `cwd`** within a run.
- A `cwd` that cannot be resolved to a repo (deleted / pruned / non-git) is **kept at its literal path** as `rootPath` with null remote (ADR-0002). Never dropped.
- The Interaction's `cwd` is taken from its opening user record; sub-agent cwds are ignored for Project identity. `session.projectId` takes the session's opening cwd; each Interaction still carries its own `projectId`.

### Session, timestamp, checkpoint

- `stableSessionId` = the session file's UUID (== the `sessionId` field; one session per file). `session.startedAt/endedAt` = min/max record `timestamp` in the main file.
- **Interaction instant** = the opening user record's ISO `timestamp` parsed to epoch-ms UTC (when the user initiated). `localDow/localHour/localDate` precomputed via the existing `deriveLocalBuckets(instant, settings.timezone)` (ADR-0005).
- **Checkpoint tracks the primary session file only** (ADR-0007). On re-ingest, a file whose `(fileSize, fileMtime)` both match its checkpoint is skipped; otherwise parse from `lastCompleteRecordByteOffset`. A "complete record" is a line terminated by `\n`; a trailing partial line is neither consumed nor checkpointed. Sub-agent files are re-read wholesale each run; idempotency backstops correctness.

### Raw archive (S7)

- When `settings.rawArchiveEnabled`, the ingest loop copies the untouched raw bytes of a session file (and its `subagents/*` siblings) to `rawArchivePath` **before parsing**, mirroring the source directory layout, so a parser crash still preserves the file and the archive stays re-ingestable (ADR-0003).
- **Copy-on-change:** archive a file when it is new or changed vs its archived copy (same `(size, mtime)` skip as the checkpoint); full-file overwrite, not incremental.
- When archiving is off, skip entirely. Ingest correctness never depends on the archive.

### Jobs screen (S5)

- A `POST` endpoint dispatches `(ingest, claude)` and returns the correlation id (mirrors the stub endpoint); the existing SSE endpoint streams `progress`/`log`/`done` events by correlation id. Re-dispatch of a running identity returns the in-flight correlation id (ADR-0006), and a page reload reattaches because `job_run` is persisted (ADR-0004).
- The screen renders run history from `job_run` rows plus live progress from the SSE stream.

### Views (S6)

- **Store aggregation read-functions** (new, alongside `insertInteraction` etc.): headline totals (Interaction count; token usage = main + sub summed across all four buckets) and a heatmap aggregation (`GROUP BY localDow, localHour` counting Interactions). Views render these; no per-row timezone work at query time (ADR-0005).

### Schema

- **No S2 migration required.** Every decision fits the existing `interaction` / `session` / `project` / `checkpoint` / `settings` columns and keys. This is an explicit outcome of the grilling and a signal the model holds.

## Testing Decisions

- **Test external behaviour, not internals.** Assert on the normalised rows, checkpoint state, emitted progress, and archived files that result from ingesting fixture logs — never on parser internals or intermediate shapes. Rebuilding the parser differently must not break the tests as long as the stored result is the same.
- **Primary seam — the Claude ingest Job handler.** Drive the handler against a temporary database (`openDatabase({ LLM_RETRO_DATA_DIR })`) and a fixture Claude-log directory tree (main `<sessionId>.jsonl` + `subagents/…`), then assert via the store's read API on: interaction boundaries (genuine vs excluded records; response-less prompts dropped), token buckets and main-vs-sub split (incl. nested flattening), model canonicalisation, Interaction instant + local buckets, idempotent re-runs, checkpoint resumption (grow a fixture file, control `mtime` via `utimes`), and archive output (files present, layout mirrored, off = absent). Prior art: `src/lib/server/jobs/job-runner.test.ts` (temp DB, fixture JSONL, `utimes`, controlled handlers).
- **Injected resolver in the handler test** keeps Project resolution deterministic (fake `cwd → { rootPath, gitRemoteUrl }`); the **real git-backed resolver** gets its own narrow integration test over a couple of throwaway `git init` / `git worktree add` directories, asserting worktree + plain-clone collapse and the unresolvable-path fallback.
- **View aggregations** tested at the store read-function seam against seeded Interaction rows (headline totals; `localDow × localHour` counts), not rendered DOM. Prior art: `src/lib/server/database/store.test.ts`.
- **Endpoint** tested as the stub endpoint is (`src/routes/api/jobs/stub/server.test.ts`): dispatch returns a correlation id; re-dispatch of a running identity returns the same id.
- Runner: `vitest run` (`npm test`).

## Out of Scope

- The other three adapters (pi, Codex, omp) — Milestone 3. Only the adapter *contract* is set here.
- Fast-follow views: Projects, Models & Harnesses, Sessions — Milestone 4.
- Prompt/response text ingestion and "weak input" analysis — deferred (ADR-0003); the store holds no text.
- Scheduled / daemonised ingest — deferred; ingest stays user-triggered.
- Cost/pricing — permanent non-goal; token usage only.
- User-initiated job cancellation — deferred (ADR-0004); no client→server channel.
- Any change to the S2 store schema or the S3 job-runner mechanics.
- Graduating the perishable Claude log-format reference into a durable parser-reference doc — a graduation task for when the milestone lands, not part of building it.

## Further Notes

- The milestone's real purpose is to *prove the model*: that the Interaction grain, sub-agent fold-up, Project collapse, and token buckets survive contact with real Claude logs. The strongest evidence gathered during grilling is that **no schema change is needed** and the hardest problem (genuine-prompt detection) has clean on-disk signals (`isMeta`, `tool_result`, `isSidechain`).
- Two on-disk facts were verified this session and corrected in `.scratch/llm-retro/spec.md`: sub-agents now live in separate `subagents/` files (not inline `isSidechain`), and injected content is flagged `isMeta:true`. Build the adapter to handle both sub-agent representations.
- Decisions recorded durably: ADR-0001 (Interaction requires ≥1 assistant response), ADR-0002 (unresolvable cwd kept at literal path), ADR-0007 (checkpoint tracks the primary session file). ADR-0004/0005/0006 already cover SSE progress, local-bucket precompute, and the per-identity dispatcher.
- Sequence within the milestone (roadmap): S4 adapter → S7 archive (early, protects history) → S5 Jobs screen → S6 views. S6 depends only on stored Interactions; S5 on the dispatcher + adapter.
