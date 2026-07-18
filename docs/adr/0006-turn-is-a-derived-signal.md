# `Turn` is a derived Signal, not stored

**Status:** accepted

The Normalised Session Model stores a Session as a flat, totally-ordered `Message[]` spine (0-based per-Session integer `index`). A **Turn** — one user-prompt-then-AI-response exchange — is **not** a stored record; it is computed on demand by an analysis Job (the Turn-count Signal, and anything that groups by Turn).

## Considered Options

- **Segment Turns at extraction and store them as records.** Rejected: the three Tools disagree on turn boundaries (Claude walks `parentUuid` chains, pi linearises a `parentId` tree, Codex is file-order after de-duping double-emitted records), so segmenting at ingest bakes in one lossy interpretation and forces a full re-extract whenever the grouping heuristic changes.

## Consequences

- Extraction stays mechanical; Turn-grouping logic evolves as a versioned analysis Job ([ADR-0002](0002-jobs-as-self-describing-containers.md) re-run semantics) without re-reading source transcripts.
- The same principle governs cost and cross-Tool model families — all analysis-time derivations — keeping the store faithful to "what the transcript contains" ([ADR-0005](0005-normalised-session-model-lossless-core-plus-raw.md)).
- The Message spine is the stable contract; `(session_id, index)` is the universal Message identity and the total order (ties broken by `index`, not timestamp).
- Turn derivation is interpretive-but-deterministic, so it remains a Signal, not an Inference ([ADR-0008](0008-signals-deterministic-inferences-interpretive.md)).

Decided in [#3](https://github.com/jonnyasmith/llm-retro/issues/3).
