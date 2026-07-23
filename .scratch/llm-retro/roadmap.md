# Roadmap: LLM Retro

> Ephemeral. Sequenced future sessions to reach a working solution. Each item = a session's worth of work with its entry state, output, and dependencies. Delete once delivered. Full context in `spec.md` + `docs/adr/`.

## Sequencing principle

- Vertical slices: get one Harness end-to-end (parse → store → view) before breadth. Proves the schema against real data early.

## Milestone 1 — Skeleton + store (foundation)

- **S1. App skeleton** — SvelteKit + SQLite + TS scaffold; one process serves UI + API; local run. Needs: nothing.
- **S2. Store schema** — Interaction / Session / Project / Checkpoint tables; token buckets nullable; Interaction idempotency key; local-time bucketing helpers. Needs: S1, ADR-0001/0002/0003.
- **S3. Job runner** — multi-job dispatcher keyed per identity (type + scope), each run persisted with checkpointing, restart-reconciliation, and live SSE progress; worker-thread seam for later CPU-bound jobs; proven against a stub job. Foundation for the Jobs screen. Needs: S2. Full spec: `.scratch/skeleton-store-foundation/spec.md`.

## Milestone 2 — First Harness end-to-end (proves the model)

- **S4. Claude adapter** — richest, cleanest tokens. Solve genuine-user-prompt detection (exclude tool-result user records), sub-agent fold-up + split, Project root resolution (worktree collapse). Needs: S2, S3.
- **S5. Jobs screen** — trigger ingest, watch progress, run history + checkpoint state. Needs: S3, S4.
- **S6. Overview + Activity/time views** — headline totals; hour × day-of-week heatmap. First real "how I work" payoff on Claude data. Needs: S4.
- **S7. Configurable raw archive** — copy raw files during ingest; toggle + path config. Needs: S4. (Do early — it protects history the moment ingest starts running.)

## Milestone 3 — Breadth across Harnesses

> Contract frozen in `docs/adr/0008` (adapter-strategy seam), `0002` (Session may span Projects), `0001` (adapter-supplied `interaction_key`). Sequencing de-risks the seam against the hardest Harness while it's warm: build pi concretely → extract → grill+build Codex → build omp. Adapter owns topology + `stableSessionId` + `parse(slice) → NormalisedSession`; pipeline owns stable-read, checkpoint, slice, archive, store, dedup; absence rides the null-object rule (no `if harness ===`).

- **S8. pi adapter** — build concretely against the current Claude ingest (extraction comes next, S8b). Genuine prompt = `message.role === "user"` (tool results are a distinct `toolResult` role; no `isMeta` needed). Interaction model comes straight off assistant messages (`model_change` is a marker, not a decision). Fact-find at build time: where flat-file pi sub-agent tokens live (either outcome absorbed by null-object). No grilling required. Needs: S4.
- **S8b. Extract shared ingest pipeline** — refactor Claude + pi into the ADR-0008 seam: pipeline owns the generic machinery, adapters implement `discoverSessionGroups()` + `parse`. Lands the two model bends as migrations: `opening_user_record_id` → `interaction_key`; `session.projectId` → nullable. Design pass, not a grilling. Needs: S8.
- **S9-grill. Codex grilling** — dedicated session (the only M3 decision surface): genuine-prompt detection (a `turn_id` bundles an injected env/context user record + the typed prompt — the Codex `isMeta` analogue); Interaction boundary (`turn_id` vs first-user-record); `token_count` cumulative-vs-delta + correlating separate `event_msg` token records to turns. Run immediately after S8b to catch seam leaks while warm. Needs: S8b.
- **S9. Codex adapter** — per-turn model + `cwd` from `turn_context` (Session spans Projects → interaction-level attribution, nullable session project); `stableSessionId` from `session_meta.payload.id`; topology is date-nested + relocation into `archived_sessions` (dedup across two roots); null cache_write. Needs: S9-grill.
- **S10. omp adapter** — the Claude-twin: parse raw session logs incl. nested sub-agent files; mirror `stats.db` offset/dedup approach. Low decision density; contract + Claude adapter answer most of it. No grilling required. Needs: S9.

## Milestone 4 — Fast-follow views

- **S11. Projects view** — per-Project breakdown over time. Needs: S6 aggregation layer.
- **S12. Models & Harnesses view** — model/harness mix, tokens per model. Needs: S6.
- **S13. Sessions view** — session counts + shape (interactions/session, duration). Needs: S6.

## Graduation tasks (when work lands)

- Move the harness log-format reference from `spec.md` into a durable parser-reference doc.
- Delete `.scratch/llm-retro/` once views ship and references have graduated.

## Deferred (post-solution, out of current scope)

- Prompt-text ingestion + "weak input" analysis (re-ingest raw/archived files with a text-capturing parser).
- Scheduled/launchd ingest for near-live feel.
