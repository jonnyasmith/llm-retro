# The Normalised Session Model is lossless-core plus verbatim `raw`

**Status:** accepted

Every source record is extracted into two layers: a typed **core** (universal fields, present-or-null across all three Tools) and a verbatim **`raw`** field holding the original source object unchanged. Extraction is mechanical and 1:1 — lossless — with all interpretation deferred to analysis Jobs. Unpromoted, Tool-specific fields (Codex git commit, Claude permission mode and cache 5m/1h sub-splits, pi cost and `thinkingSignature`, schema-drift fields) stay recoverable from `raw` without re-reading the ~1.8 GB of source transcripts.

Core Session fields: `{ id, tool, kind, cwd, project, git_branch, started_at, source_path }`, uniquely keyed `(tool, id)`. Core Message fields: `{ session_id, index, native_id, role, timestamp, model, content[], usage }`, keyed `(session_id, index)`. Message content is a closed block set — `text`, `reasoning`, `tool_call`, `tool_result`, `image` — where even a presence-only block (e.g. encrypted pi `reasoning`) is itself Signal.

## Considered Options

- **Flatten to plain text, or promote a fixed field set and drop the rest.** Rejected: discards tool-call and reasoning presence (both core Signals) and forces re-reading ~1.8 GB whenever a currently-unpromoted field is later needed.
- **Interpret at extraction** (segment Turns, derive cost, alias models across Tools). Rejected: bakes one lossy interpretation into the canonical store; interpretation belongs in versioned analysis Jobs (see [ADR-0006](0006-turn-is-a-derived-signal.md)).

## Consequences

- `raw` roughly doubles on-disk size. Accepted: disk is cheap, re-extraction is not; `raw` is droppable for cold Sessions because the source files persist and the whole store is re-derivable ([ADR-0001](0001-postgres-single-source-of-truth.md)).
- Per-Message **effective `model`** by carry-forward (Claude direct; Codex latest `turn_context.model`; pi per-message, message-level winning over `model_change`), stored verbatim and Tool-native — there is **no session-level model**, since Sessions are multi-model-capable. Cross-Tool model families are an analysis-time derivation, not stored.
- Per-Message nullable `usage` carries a **`basis`** flag = `per_message` (pi/Claude, mapped directly) or `reconstructed` (Codex, diffed from consecutive cumulative snapshots; **absent, never zero**, where snapshots are null). Approximate fidelity is explicit rather than hidden.
- Cost is not a core field and not a v1 Signal; tokens (`usage`) is the economic metric. pi's native cost survives only in `raw`. (Deliberate scoping call.)
- Timestamps are unified to ISO-8601 UTC (pi nested epoch-ms converted); original parent pointers and Tool-native structure are preserved in `raw`.

Decided in [#3](https://github.com/jonnyasmith/llm-retro/issues/3).
