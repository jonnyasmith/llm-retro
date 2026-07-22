# Roadmap: LLM Retro

> Ephemeral. Sequenced future sessions to reach a working solution. Each item = a session's worth of work with its entry state, output, and dependencies. Delete once delivered. Full context in `spec.md` + `docs/adr/`.

## Sequencing principle

- Vertical slices: get one Harness end-to-end (parse → store → view) before breadth. Proves the schema against real data early.

## Milestone 1 — Skeleton + store (foundation)

- **S1. App skeleton** — SvelteKit + SQLite + TS scaffold; one process serves UI + API; local run. Needs: nothing.
- **S2. Store schema** — Interaction / Session / Project / Checkpoint tables; token buckets nullable; Interaction idempotency key; local-time bucketing helpers. Needs: S1, ADR-0001/0002/0003.
- **S3. Job runner** — in-process background job with checkpointing + restart; foundation for the Jobs screen. Needs: S2.

## Milestone 2 — First Harness end-to-end (proves the model)

- **S4. Claude adapter** — richest, cleanest tokens. Solve genuine-user-prompt detection (exclude tool-result user records), sub-agent fold-up + split, Project root resolution (worktree collapse). Needs: S2, S3.
- **S5. Jobs screen** — trigger ingest, watch progress, run history + checkpoint state. Needs: S3, S4.
- **S6. Overview + Activity/time views** — headline totals; hour × day-of-week heatmap. First real "how I work" payoff on Claude data. Needs: S4.
- **S7. Configurable raw archive** — copy raw files during ingest; toggle + path config. Needs: S4. (Do early — it protects history the moment ingest starts running.)

## Milestone 3 — Breadth across Harnesses

- **S8. pi adapter** — messages with `usage`; handle `model_change`. Needs: S4 (adapter contract).
- **S9. Codex adapter** — correlate `token_count` event records to turns (resolve cumulative vs delta); per-turn model from `turn_context`; null cache_write. Needs: S4.
- **S10. omp adapter** — parse raw session logs incl. nested sub-agent files; mirror offset/dedup approach. Needs: S4.

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
