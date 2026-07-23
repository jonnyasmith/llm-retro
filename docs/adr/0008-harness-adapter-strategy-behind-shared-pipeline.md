# Harness adapters are a strategy behind one shared ingest pipeline

Ingesting four Harnesses whose logs disagree on topology, identity, and structure could mean four parallel ingest jobs, each re-implementing the subtle correctness machinery (mid-read stability, checkpoint resume, archive, idempotent store writes). Instead, each Harness is a **strategy** behind a single harness-agnostic pipeline: the pipeline owns everything generic, and an adapter adapts only what is genuinely Harness-shaped.

## The seam

- **Adapter (per Harness) owns** — enumerating its source-file groups (its directory topology, and Codex's relocation into `archived_sessions`), deriving the `stableSessionId`, and parsing a text slice into a normalised Session (genuine-prompt detection, token extraction, sub-agent fold-up + main/sub split, the stable `interaction_key`).
- **Pipeline owns** — stable snapshot read (re-stat before/after to catch a file mutating mid-read), byte-offset checkpoint + incremental slice + resume-on-growth, raw archive, store writes (session/interaction/project upsert on the idempotency key), and cross-run dedup.

## Absence is the null object

A Harness that lacks a capability adapts by returning emptiness the pipeline already swallows, reusing the domain rule "a bucket a Harness does not report is null, never zero". No sub-agents or sub-tokens not separately logged → `subTokens` all null; no `cache_write` (Codex) → that bucket null; no sub-agent files → an empty source-file-group list the generic loop iterates zero times. The pipeline therefore carries no `if (harness === …)` branch.

## Considered options

- **Per-adapter monolith** — one ingest job per Harness. Rejected: it clones the mid-read/resume/archive/dedup logic (the code most likely to hide subtle bugs) four times, and each clone drifts.
- **Adapter reads its own files end-to-end** (pipeline is a bare job shell). Rejected: pushes checkpoint and idempotency correctness into every adapter for no gain, since that machinery is identical across append-only JSONL Harnesses.

## Consequences

- The contract is frozen against the outlier deliberately: pi is built concretely first, then Claude+pi are extracted into the pipeline, then Codex — the hardest Harness — is built immediately after the extract so any leak in the seam surfaces while it is still warm, with omp (the Claude-twin) last.
- Concerns that look cross-cutting but are Harness-specific stay inside the adapter: `token_count` cumulative-vs-delta correlation (Codex), where sub-agent tokens live (Claude sibling files, omp nested files, pi flat). The pipeline never learns of them.
