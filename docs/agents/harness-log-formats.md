# Harness log formats

A map of where each Harness writes its logs and which fields carry the facts Ingestion needs. **The adapter and its log reader test are the source of truth**; this document points at them. Verify against the code before trusting a line here. The per-Harness tests below cover only what is specific to that Harness's grammar: everything shared runs against every registered Harness in `src/lib/server/jobs/ingest.test.ts`, off the fixture in `src/lib/server/jobs/ingest-fixture.ts`, which also owns each Harness's on-disk test layout.

The reasoning behind any parsing rule lives in the ADRs, not here: the Interaction grain in [ADR-0001](../adr/0001-interaction-grain-bounded-by-user-prompts.md), Project identity in [ADR-0002](../adr/0002-project-identity-by-local-repo-root-path.md), the adapter/pipeline seam and per-Harness Interaction modelling in [ADR-0008](../adr/0008-harness-adapter-strategy-behind-shared-pipeline.md), and Codex Interaction extraction in [ADR-0010](../adr/0010-codex-interaction-extraction.md).

Common to all four: logs are append-only JSONL, one JSON object per line; timestamps are ISO-8601 strings in a record's `timestamp`; log roots are the Log sources, whose built-in defaults are `resolveDefaultLogSources` in `src/lib/server/database/store.ts` and which the user may override per Harness. Files that are not `*.jsonl` are never read.

## Claude

Adapter: `src/lib/server/jobs/claude-adapter.ts`. Log reader: `src/lib/server/jobs/claude-log-reader.ts`. Tests: `src/lib/server/jobs/claude-log-reader.test.ts`, `src/lib/server/jobs/claude-log-reader-subagents.test.ts`.

- **Root and topology** — `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. Exactly one directory level below the root is scanned.
- **Sessions** — one file is one Session; the filename stem is the stable session id.
- **Sub-agents** — sibling directory `<encoded-cwd>/<sessionId>/subagents/agent-*.jsonl`. Their records carry `isSidechain: true` and an `agentId`; the same records may also appear inline in the primary file in older logs, and the adapter groups them by `agentId` either way. A sub-agent is tied to its spawning Interaction through the `Agent` `tool_use` block's `id`, matched to a `tool_result` whose `toolUseResult` has `status: "completed"` and an `agentId`.
- **Record types** — only `user` and `assistant` are interpreted; every other `type` is ignored (`attachment`, `system` and `last-prompt` appear in the fixtures as ignored noise). `user` records carry `isMeta` and `isSidechain` flags and a `message.content` that is either a string or a block array (`text`, `tool_use`, `tool_result`).
- **Model** — `message.model` on `assistant` records.
- **Tokens** — `message.usage`: `input_tokens` → `input`, `output_tokens` → `output`, `cache_read_input_tokens` → `cache_read`, `cache_creation_input_tokens` → `cache_write`. All four buckets are reported.
- **Working directory** — `cwd` on the record.
- **Session identity** — the filename stem. **Interaction key** — the prompt record's `uuid`, falling back to `id`.

## pi

Adapter: `src/lib/server/jobs/pi-adapter.ts`. Log reader: `src/lib/server/jobs/pi-log-reader.ts`. Test: `src/lib/server/jobs/pi-log-reader.test.ts`.

- **Root and topology** — `~/.pi/agent/sessions/<encoded-cwd>/<ts>_<uuid>.jsonl`. One directory level below the root is scanned; nothing is parsed out of the filename.
- **Sessions** — one file is one Session. Its **first** line must be a `session` record carrying `id`, `cwd` and `timestamp`.
- **Sub-agents** — **not logged anywhere**. A `subagent` tool call and its `toolResult` are plain text with no `usage` and no separate file, so the sub-agent token buckets stay null and the Interaction is flagged `spawnedSubagents` to disclose that its total is a floor ([ADR-0008](../adr/0008-harness-adapter-strategy-behind-shared-pipeline.md)).
- **Record types** — `session` and `message` are interpreted; `model_change` appears and is deliberately ignored. A `message` record's `message.role` is `user`, `assistant`, or `toolResult`.
- **Model** — `message.model` on assistant messages.
- **Tokens** — `message.usage`: `input`, `output`, `cacheRead`, `cacheWrite`, already matching the canonical bucket names.
- **Working directory** — the `session` record's `cwd`, overridden by a `cwd` on an individual message when present.
- **Session identity** — the `session` record's `id`. **Interaction key** — the user message's `id`.

## Codex

Adapter: `src/lib/server/jobs/codex-adapter.ts`. Log reader: `src/lib/server/jobs/codex-log-reader.ts`. Test: `src/lib/server/jobs/codex-log-reader.test.ts`.

- **Roots and topology** — `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`, plus `~/.codex/archived_sessions/` with the same layout. Both roots are enumerated by default; `.jsonl` files sitting directly in a root are also picked up. A completed rollout is **moved** into `archived_sessions`, so the same file is reachable under two roots and enumeration de-duplicates by filename.
- **Sessions** — one file is one Session. Its first line is a `session_meta` record.
- **Sub-agents** — none are written.
- **Record types** — `session_meta`, `turn_context`, and `event_msg` are interpreted; `response_item` records (including user-role ones) are ignored. An `event_msg` is discriminated by `payload.type`: `user_message`, `agent_message`, `token_count`.
- **Model** — `turn_context` `payload.model`. It can change between turns.
- **Tokens** — `event_msg` `payload.info` on a `token_count` record: `last_token_usage.{input_tokens, cached_input_tokens, output_tokens}` is the per-round-trip delta, `total_token_usage.total_tokens` the session-cumulative figure. `cache_write` has no Codex equivalent and is always null. How the deltas are counted and mapped onto disjoint buckets is [ADR-0010](../adr/0010-codex-interaction-extraction.md).
- **Working directory** — `turn_context` `payload.cwd`. It can change between turns, so one Session can span Projects.
- **Session identity** — `session_meta` `payload.id`. **Interaction key** — `turn_context` `payload.turn_id`, or the prompt event's `timestamp` in older rollouts that have no `turn_id`.

## omp

Adapter: `src/lib/server/jobs/omp-adapter.ts`. Log reader: `src/lib/server/jobs/omp-log-reader.ts`. Test: `src/lib/server/jobs/omp-log-reader.test.ts`.

- **Root and topology** — `~/.omp/agent/sessions/<folder>/<ts>_<uuid>.jsonl`. One directory level below the root is scanned.
- **Sessions** — one primary file is one Session. The `session` record carrying `id`, `cwd` and `timestamp` need not be the first line: another record (a `title`) may precede it.
- **Sub-agents** — JSONL files nested under a directory named after the primary file's stem, recursively: `<session>/<Agent>.jsonl`, and a child of that agent at `<session>/<Agent>/<Agent>.<Child>.jsonl`. A `task` tool call's `arguments.tasks[].name` names the children; a `toolResult` containing `<task-result id="…" status="completed">` marks which of them completed, and only those fold their assistant usage into the spawning Interaction's sub-agent buckets.
- **Derived statistics database** — omp also ships `~/.omp/stats.db`, a derived SQLite database of the same activity. It is deliberately **not** an ingestion source ([ADR-0008](../adr/0008-harness-adapter-strategy-behind-shared-pipeline.md)); only the raw JSONL is parsed.
- **Record types** — `session` and `message`; a `message` record's `message.role` is `user`, `assistant`, or `toolResult`. The wire format is pi-shaped, not Claude-shaped.
- **Model** — `message.model` on assistant messages.
- **Tokens** — `message.usage`: `input`, `output`, `cacheRead`, `cacheWrite`.
- **Working directory** — the `session` record's `cwd`, overridden by a `cwd` on an individual message when present.
- **Session identity** — the `session` record's `id`. **Interaction key** — the user message's `id`.
