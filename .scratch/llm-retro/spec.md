# PRD: LLM Retro

> Ephemeral. Durable homes already hold the rationale: domain vocabulary → `docs/agents/domain.md`; decisions → `docs/adr/0001..0003`. This file exists to guide future sessions and will be deleted once the work lands. The one thing here with no durable home yet is the **harness log-format reference** below — graduate it to a parser-reference doc when the adapters are built.

## Problem

- The user runs four LLM coding Harnesses (Claude, Codex, pi, omp) and has no unified view of _how they work_ across them.
- Goal: a behavioural work-tracker — activity over time, model/harness mix, project split, token usage. Not a cost tool.

## Users

- Single user, single machine, local-first. Framed as a team work-tracker but used solo. No auth, no multi-tenant, no cloud.

## Goals

- Answer "how do I work" — interactions by hour/day, by Project, by Model/Harness; session counts and shape; token usage.
- Token usage is a first-class metric; monetary cost is explicitly out.

## Non-goals (this build)

- No prompt/response text in the query store; no "search my prompts" (deferred, not blocked — see ADR-0003).
- No live daemon; no cross-machine unification; no cost/pricing.

## Domain

- See `docs/agents/domain.md` for the full glossary. Grain = **Interaction** (one user prompt + everything until the next), sub-agents folded up with a main-vs-sub token split (ADR-0001).

## Functional requirements

- **Ingestion** — user-triggered background job from a **Jobs screen**; per-file **Checkpoint** so it restarts without reprocessing; idempotent re-runs.
- **Configurable raw archive** — copy untouched raw files to an app-owned dir during ingest; toggle + path configurable (ADR-0003).
- **Parsers** — one adapter per Harness → one normalised Interaction. Start with the richest/cleanest (Claude, pi).
- **Views** — Core: Overview, Activity/time (hour × day-of-week heatmap), Jobs. Fast-follow: Projects, Models/Harnesses, Sessions.
- **Time** — store UTC, bucket/display in local time; timezone configurable.

## Constraints / architecture

- SvelteKit + SQLite + TypeScript, one local process (UI + API + job).
- Normalised-only store: Interaction / Session / Project + Checkpoint. Raw files on disk stay the system of record.
- Project identity = local repo root path; worktrees/subdirs collapse up; remote URL kept for display (ADR-0002).
- Token buckets: `input` / `output` / `cache_read` / `cache_write`; null = absent, not zero.

## Harness log-format reference (perishable — verified on disk this session)

- **Claude** — `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` (filename == `sessionId`, one session per file). Typed records; `type:"assistant"` carries `message.model`, `message.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens` → cache_write, `cache_read_input_tokens` → cache_read, `service_tier`), plus `timestamp`, `cwd`, `gitBranch`, `sessionId`. **Genuine-user-prompt detection (verified this session):** a `type:"user"` record is a genuine prompt only when `isSidechain` is not true, `isMeta` is not true (injected skill bodies / reminders carry `isMeta:true`), and its content is text (not a `tool_result` block); slash commands count (user typed them). Non-message noise types to skip: `attachment`, `system`, `mode`, `permission-mode`, `file-history-snapshot`, `last-prompt` (the latter mirrors the verbatim typed prompt — a dev-time oracle only, no tokens). **Sub-agents:** current Claude writes them to sibling `<sessionId>/subagents/agent-<agentId>.jsonl` files (records flagged `isSidechain:true`, carrying `agentId` + parent `sessionId`), *not* inline in the main file; the spawning `Agent` tool-use's tool_result carries the `agentId`, giving `agentId → spawning Interaction`. Older logs may still carry inline `isSidechain` records.
- **pi** — `~/.pi/agent/sessions/<encoded-cwd>/<ts>_<uuid>.jsonl`. Records: `message`, `session`, `model_change`, `thinking_level_change`. Messages carry `model` and `usage.{input,output,…}`. Model can change mid-session (`model_change`).
- **Codex** — `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`. Records: `session_meta`, `response_item`, `event_msg`, `turn_context`. Model + `cwd` in `turn_context` (can change per turn). Tokens in `event_msg` `payload.type:"token_count"` — separate records carrying **both** cumulative (`total_token_usage`) and per-round-trip delta (`last_token_usage`); attribute by summing the deltas within a turn (Interaction modelling resolved — ADR-0008). No cache_write concept (leave null). Note `~/.codex/archived_sessions/` — logs get moved; motivates the archive.
- **omp** — raw logs at `~/.omp/agent/sessions/<folder>/<ts>_<uuid>.jsonl` (+ nested sub-agent files). Also ships a **derived** `~/.omp/stats.db` `messages` table (model, provider, api, tokens, cost, `agent_type` main/sub, `stop_reason`) with `file_offsets` for incremental parsing and `UNIQUE(session_file, entry_id)` — strong prior art for our Checkpoint + idempotency key. Parse the raw logs (not stats.db) for consistency, but mirror its offset/dedup approach.

## Open questions (carried from grilling)

- Genuine-user-prompt detection: **resolved for Claude** (see reference above; an Interaction also requires ≥1 assistant response — ADR-0001). **pi & Codex resolved — ADR-0008** (pi: `message.role === "user"`; Codex: `turn_context` gated on a genuine `user_message`). omp resolves at build as the Claude-twin behind the frozen contract.
- Interaction idempotency key — **resolved**: `UNIQUE(sessionId, interaction_key)`, an adapter-supplied per-Interaction key (Claude record `uuid`, pi message `id`, Codex `turn_id`) — ADR-0001.
- Codex `token_count` cumulative vs delta, and mixed-model Interaction handling — **resolved — ADR-0008** (sum `last_token_usage` deltas per turn; pi carries the serving-model rule, Codex reads model from `turn_context`).
