# Spec: Skeleton + Store Foundation (Milestone 1)

Status: ready-for-agent

> Covers roadmap Milestone 1 — S1 (app skeleton), S2 (store schema), S3 (job runner).
> Solution context: `.scratch/llm-retro/spec.md` + `docs/adr/0001..0003` + `docs/agents/domain.md`.
> This is the foundation slice: no real parsing yet — the first adapter (Claude) is Milestone 2.

## Problem Statement

The user runs four LLM coding Harnesses and wants a behavioural work-tracker built on their session logs. Nothing exists yet: there is no application, no store to hold normalised Interactions, and no way to run Ingestion as a restartable background job. Before any Harness data can be parsed or any view drawn, there must be a running application, a schema that can hold the normalised model, and a job runner that can execute background work with progress, checkpointing, and safe restart. This spec builds that foundation and proves the job-runner mechanics against a stub job, so the first real adapter drops in behind a known contract.

## Solution

A single local SvelteKit process (UI + API + job runner) backed by SQLite. It ships:

- An **app skeleton** — one long-running Node process, SQLite via a typed data-access layer, migrations applied at boot.
- A **store schema** — Project / Session / Interaction / Checkpoint / job_run / settings, shaped as a star schema with Interaction as the fact table, idempotency and local-time bucketing baked in.
- A **job runner** — a dispatcher that runs multiple concurrent background Jobs keyed by identity, each persisted as a job run, each streaming live progress to the UI over SSE, each safe to interrupt and re-trigger. Exercised end-to-end by a stub job so the contract is proven before Ingestion exists.

## User Stories

1. As the user, I want to start the app as one local process that serves the UI, the API, and background jobs, so that there is nothing to deploy or wire together.
2. As the user, I want the database to live in a conventional app data directory, so that my data has a predictable home I can back up.
3. As the developer, I want the DB location overridable by a single environment variable, so that tests and dev runs use throwaway databases.
4. As the developer, I want schema defined as typed code with generated, committed migrations, so that schema changes are reviewable diffs.
5. As the developer, I want pending migrations to apply automatically at boot, so that "pull and run" always yields a current database.
6. As the developer, I want the DB connection and job runner instantiated once at server startup, so that long-lived state (open connection, in-flight jobs, held-open streams) has a single owner.
7. As the user, I want every Interaction attributed to exactly one Project identified by its local repository root, so that worktrees and subdirectories roll up correctly (ADR-0002).
8. As the user, I want each Session tied to one Harness and one Project and identified by the Harness's stable session id, so that a Session's identity survives the log file being moved (e.g. Codex archiving).
9. As the user, I want token usage stored in four canonical buckets that can be null, so that a bucket a Harness never reports stays absent rather than being counted as zero.
10. As the user, I want sub-agent tokens folded into the spawning Interaction but retained as a main-vs-sub split, so that interaction counts stay honest while token totals stay complete (ADR-0001).
11. As the user, I want each Interaction to carry both a canonical Model id and the raw Model string the Harness reported, so that the same model aggregates across Harnesses while the original is preserved for provenance and debugging.
12. As the user, I want each Interaction to carry its Harness and Project directly, so that headline slices ("by hour", "by Project", "by Harness") run without joins.
13. As the user, I want interaction timestamps stored in UTC and pre-bucketed into local day-of-week / hour / date, so that the activity heatmap is a fast, DST-correct query in my configured timezone.
14. As the user, I want to change my configured timezone and have the local buckets rebuilt from stored UTC, so that changing timezone never means re-reading log files.
15. As the user, I want re-running Ingestion never to create a duplicate Interaction, so that re-runs are safe.
16. As the developer, I want Interaction idempotency enforced by a unique key on (session, opening user-record id), so that correctness does not depend on the checkpoint being accurate.
17. As the user, I want Ingestion to record how far it consumed each log file, so that a re-run or a restart after a crash resumes from where it stopped instead of reprocessing.
18. As the developer, I want the checkpoint to detect an unchanged file and skip it, and detect a shrunk/replaced file and re-read it, so that ordinary re-runs are cheap and pathological cases self-heal.
19. As the user, I want my preferences (timezone, raw-archive toggle and path, log-source overrides) stored in the database, so that a settings UI can read and write them transactionally.
20. As the user, I want to trigger a background job and have the request return immediately with a handle, so that the UI stays responsive while the job runs.
21. As the user, I want to watch a running job's live progress — percentage complete, the file being processed now, a streaming log, and the terminal outcome — so that I can see what is happening.
22. As the user, I want the UI to reconnect to an in-flight job's progress after a page reload, so that refreshing does not lose visibility of a running job.
23. As the user, I want to run different jobs concurrently (e.g. separate per-Harness ingests, later a machine-learning job), so that unrelated work is not serialised behind a single global lock.
24. As the developer, I want the runner to refuse a second run of the *same* job identity and hand back the in-flight handle, so that two runs of the same scope cannot race the same files.
25. As the developer, I want each job run tagged with a correlation id used both as its log tag and its progress-stream topic, so that a run is traceable across logs and UI.
26. As the user, I want to see the history of past job runs with their status, timing, and outcome, so that I can tell what ran and whether it succeeded.
27. As the developer, I want any job left `running` by a crashed process to be reconciled to `interrupted` at the next startup, so that the history never shows a phantom live job.
28. As the user, I want to re-trigger an interrupted job myself from the Jobs surface, so that Ingestion stays user-initiated and resumes cheaply via its checkpoint.
29. As the developer, I want the job runner shaped as a dispatcher of identified jobs, so that a future CPU-bound job type can run on a worker thread without redesigning the runner.
30. As the developer, I want the whole runner contract exercised by a stub job in Milestone 1, so that the mechanics are proven before the first real adapter is written.

## Implementation Decisions

### Runtime & data access

- **Stack**: SvelteKit + TypeScript + SQLite, one long-running process (per solution spec). **`adapter-node`** — a persistent Node server is required to hold the job runner, an open DB connection, and held-open SSE streams; static/serverless adapters are ruled out.
- **Data-access layer**: **Drizzle ORM over the synchronous `better-sqlite3` driver**. Schema-as-TypeScript-code; `drizzle-kit` generates SQL migration files that are committed to the repo. Synchronous driver chosen deliberately — for in-process local SQLite it is the faster, lower-risk default; it does not constrain async application code (DB calls simply return values instead of Promises) and does not constrain job concurrency.
- **Boot sequence** (server startup, before serving requests): open the singleton DB connection → **apply pending migrations** → **reconcile** any orphaned `running` job runs to `interrupted` → instantiate the singleton job-runner dispatcher. DB connection and dispatcher are module singletons.
- **WAL mode enabled**, so the UI/SSE can read job progress while a job writes.
- **App data directory fixed by convention** (holds the SQLite file and, later, the raw archive), overridable by **one environment variable** for tests/dev. This is the only bootstrap value that cannot live in the settings table.

### Store schema (star schema; Interaction is the fact table)

- **Project** (dimension): identity = local repository root path (ADR-0002); git remote URL kept as a display attribute only.
- **Session** (dimension): belongs to one Project, records one Harness. Natural key = **(harness, stable session-id)** taken from the log filename — chosen so identity survives a file being moved (Codex archiving). Carries session-level attributes (e.g. log file path, derived start/end).
- **Interaction** (fact): surrogate integer primary key. **Denormalises `harness` and `project_id`** onto the row (populated at ingest, when all three are known) so headline slices need no joins. Carries:
  - `model` (canonical id) **and** `model_raw` (verbatim Harness string) — canonicalisation happens at ingest; the raw string is retained as provenance. The canonical normalisation ruleset and `provider` derivation are adapter-era concerns (Milestone 2+); Milestone 1 only provides the columns.
  - **Eight nullable token columns**: `{main,sub}_{input,output,cache_read,cache_write}`. Null = bucket absent (never zero). Sub-* columns null when no sub-agent activity. **Totals are derived in queries, not stored.**
  - **Time**: `timestamp` as **epoch-milliseconds UTC** (source of truth) plus **precomputed `local_dow` (0–6), `local_hour` (0–23), `local_date`** derived at ingest from UTC + configured timezone. On timezone change these columns are **recomputed from stored UTC in one pass** — never a re-ingest. (Grouping by UTC buckets and shifting in the UI is explicitly rejected: aggregation discards the date, so DST and fractional-offset zones make a post-hoc shift incorrect.)
  - **Idempotency key**: `UNIQUE(session_id, opening_user_record_id)` — the opening genuine user-record id anchors the Interaction. This unique constraint, not the checkpoint, is the correctness guarantee for re-runs. (Identifying the *genuine* opening user record per Harness is adapter work, Milestone 2; Milestone 1 provides the column and constraint.)
- **Checkpoint**: keyed by **(harness, session-id)** (same stable identity as Session). Stores **byte offset of the last complete record** + **file size** + **mtime**. Resume seeks to the offset; size/mtime short-circuit unchanged files and detect replacement (→ reset offset, re-read; the idempotency key absorbs the re-reads). The checkpoint is a **performance optimisation**, not the correctness mechanism, so a stale offset only ever costs harmless re-reads. Only advances the offset to the last complete newline (guards against a torn final line in a live-appended log).
- **settings**: user-editable preferences in the DB (timezone, raw-archive toggle + path, log-source overrides). Table starts empty; sensible defaults (OS timezone, archive off, per-Harness conventional log paths) apply until overridden.

### Job runner

- **Job identity** = `type` + optional `scope` — e.g. `(ingest, claude)`, `(ingest, codex)`, later `(ml, embeddings)`. Modelled by a persisted **`job_run`** table so run history survives process restarts and drives the Jobs surface.
- **`job_run`** carries: `type`, `scope`, `correlation_id` (UUID minted at start), `status`, `started_at`/`finished_at` (epoch-ms UTC), `error` (null unless failed), and **coarse progress counters** (`files_total`, `files_done`). Lifecycle: `pending → running → (succeeded | failed | interrupted)`. **No `cancelled` state** — user cancel is deferred.
- **Concurrency**: a **dispatcher that runs multiple jobs concurrently**, guarded **per job identity** — starting a job whose `(type, scope)` is already `running` **refuses and returns the in-flight `correlation_id`** (the UI attaches to the running job rather than erroring). Distinct identities run in parallel. Within one process on one connection, synchronous batched writes interleave safely at transaction boundaries; the idempotency key backstops.
- **Trigger**: a `POST` starts the job **fire-and-forget** and returns the new `correlation_id` immediately; it never blocks on completion. The UI then opens the progress stream for that id.
- **Progress transport**: **Server-Sent Events**, not WebSockets. Progress is one-directional server→UI push, which SSE serves natively under `adapter-node` with auto-reconnect and no custom server. The runner **emits progress events at its event source**, keyed by `correlation_id`; the SSE endpoint is a thin adapter that streams those events (`progress` with `files_done`/`files_total`/current file; terminal `done` with status). WebSockets are reconsidered only if/when a client→server control channel (e.g. cancel) is needed; the correlation-id topic model carries over.
- **Restart semantics**: a crashed process leaves `running` rows; **startup reconciliation** flips them to `interrupted`. Interrupted jobs are **not auto-resumed** — the **user re-triggers** them (Ingestion stays user-initiated per domain), and the checkpoint makes the re-run cheap.
- **Worker-thread seam**: the dispatcher treats a job as a dispatchable unit so a future CPU-bound `type` can be backed by a `worker_threads` worker (with its own connection to the WAL'd DB) **without redesign**. Only the in-process backend is implemented in Milestone 1.
- **Stub job**: Milestone 1 has no adapter, so the runner is built and proven against a **stub job** that exercises the full contract — advances a checkpoint, emits coarse progress, streams over SSE, respects the per-identity guard, and can be interrupted to prove reconcile → re-trigger → resume. It writes **no Interaction rows**. The real Claude ingest (S4, Milestone 2) implements the same contract.

## Testing Decisions

Good tests here assert **external behaviour** through the highest available seam, never implementation detail. Real SQLite is part of the behaviour under test, so it is **not mocked** — each test gets a fresh temporary database via the data-dir environment override.

**Three seams (two integration, one pure):**

1. **Store seam (integration, temp SQLite file)** — migrations apply cleanly at boot; the `UNIQUE(session_id, opening_user_record_id)` constraint makes a repeated record yield **one** Interaction; checkpoint **resume** processes only the remainder; the **size/mtime short-circuit** skips unchanged files and a shrunk/replaced file resets and re-reads; null token buckets round-trip as absent (distinct from zero).
2. **Job-runner contract seam (integration)** — drive jobs through the runner's **public dispatch API** with the stub job, asserting on persisted `job_run` rows and **emitted progress events** (seam placed at the event source, not the SSE transport): per-identity guard **refuses a duplicate and returns the in-flight correlation id** while allowing a distinct identity to run concurrently; an interrupted run is reconciled `running → interrupted` at startup and cleanly re-triggered and resumed; coarse progress counters advance and a terminal event fires.
3. **Bucketing helper (pure unit)** — `(UTC, timezone) → local_dow/local_hour/local_date`, tested across a **DST transition boundary** and a **fractional-offset zone** (e.g. UTC+5:30), plus a **timezone-change recompute** that rebuilds buckets from stored UTC without re-ingest.

**Tooling**: **Vitest** (SvelteKit's default runner). Integration-first for the store and runner; pure unit tests for the bucketing helper. The SSE endpoint is a thin adapter over the runner event source and is not given its own test surface — its behaviour is covered at the runner seam.

**Prior art**: none — greenfield repo. This spec establishes the convention (Vitest, integration against real temp SQLite via the data-dir env override).

## Out of Scope

- **Real parsing / adapters** — S4+ (Milestone 2). S3 runs only the stub job; Milestone 1 writes no real Interactions.
- **Genuine-user-prompt detection** — the idempotency/opening-record column and constraint exist, but *populating* them is adapter work (Milestone 2).
- **Canonical Model normalisation ruleset & `provider` derivation** — Milestone 1 provides `model` + `model_raw` columns only.
- **The polished Jobs screen** — S5 (Milestone 2). Milestone 1 builds the runner + SSE + a minimal trigger/stream sufficient to test the contract, not the finished UI.
- **Views** (Overview, Activity/heatmap, Projects, Models/Harnesses, Sessions) — Milestone 2+.
- **Configurable raw archive** — S7 (Milestone 2); defined by ADR-0003 but not built here.
- **Worker-thread implementation** — only the dispatchable seam that permits it later.
- **User-initiated cancel** — deferred (no `cancelled` state).
- **Standing non-goals**: monetary cost/pricing, auth/multi-tenant, live daemon, cross-machine unification, prompt/response text in the store.

## Further Notes

- New domain vocabulary from this session — **Job** and **Job run** (background work with an identity of type + scope; Ingestion is one *kind* of Job) — is recorded in `docs/agents/domain.md`.
- Decisions with lasting, surprising rationale are recorded as ADRs: SSE over WebSockets for job progress (ADR-0004); UTC as source of truth with precomputed per-row local buckets, rejecting UTC-bucket-and-shift (ADR-0005); the multi-job dispatcher keyed per identity with a worker-thread seam (ADR-0006).
- **Unresolved (not blocking Milestone 1)**: genuine-user-prompt detection per Harness; the canonical Model mapping and provider rules; Codex `token_count` cumulative-vs-delta; the exact SSE endpoint/topic API shape.
