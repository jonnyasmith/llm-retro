# LLM Retro — v1 PRD

**Status:** ready to build · **Source of truth for scope:** map [#1](https://github.com/jonnyasmith/llm-retro/issues/1)

A tool for retrospectively reviewing the user's own AI-coding Sessions (Claude Code, Codex, pi) to learn what works and what doesn't over time. It ingests local Session transcripts, extracts a Normalised Session Model, derives deterministic Signals and LLM-derived Inferences, and serves two coordinated Viewers (metrics + retro insights) over one dataset.

Terminology is the `CONTEXT.md` glossary — Session, Tool, Normalised Session Model, Turn, Message, Signal, Inference, Course-correction, Input-noise waste, Dumb zone, Retro, Job, Viewer. This PRD uses those terms exactly.

This document is self-contained: a builder should not need the issue thread. Rationale for the hard, surprising decisions lives in the ADRs (linked inline); this PRD states _what_ to build and references _why_ rather than restating it.

---

## 1. Goal & guiding constraint

Produce a **buildable v1**: a job runner + data store where extraction Jobs normalise Claude/Codex/pi Sessions, analysis Jobs derive Signals and Inferences, and two Viewers render coordinated views over the one extracted dataset.

**Load-bearing constraint — anti-cornering.** v1 must not corner the architecture as it course-corrects. The **framework** (job runner, data store, pluggable Jobs + Viewers) is the durable core; specific Jobs and Viewers accrete over time. Every deferred capability (see §9) must be reachable by _adding_ a labelled image or a derived store, never by redesign. Decisions here are fixed in [ADR-0001](../adr/0001-postgres-single-source-of-truth.md), [ADR-0002](../adr/0002-jobs-as-self-describing-containers.md), [ADR-0003](../adr/0003-polyglot-python-jobs-sveltekit-web.md), [ADR-0004](../adr/0004-inferences-via-subscription-authed-cli-in-container.md).

All Session data is local on one machine; the tool runs as an on-demand Docker Compose stack managed via Portainer. Single-user, local.

---

## 2. Architecture

Fixed by [#5](https://github.com/jonnyasmith/llm-retro/issues/5). Rationale in the ADRs; this section is the buildable shape.

### 2.1 Data store — Postgres, single source of truth ([ADR-0001](../adr/0001-postgres-single-source-of-truth.md))

- One canonical **Postgres** (with `pgvector` in-image, **unused in v1**, reserved for future semantic search) holding: normalised core (Session/Message + verbatim `raw`), Signals, Inferences.
- The store is **disposable and re-derivable** — it rebuilds from source transcripts. Specialised stores (Parquet/OLAP export, vector index) are **derived Job outputs**, never competing originals.

### 2.2 Job execution — one-shot containers via the Docker API

- **No broker, no queue, no always-on workers.** Each Job runs as a **one-shot container** launched on trigger, does its work, writes Postgres, exits.
- **The store is the decoupling seam:** the web app reads Postgres, Jobs write Postgres; they never talk directly.
- The **web app is the control plane** — every Job is an explicit user action; nothing runs on schedule or on stack-up. View-only usage keeps only `web`+`db` up.

### 2.3 Plugin model — self-describing Job images ([ADR-0002](../adr/0002-jobs-as-self-describing-containers.md))

- Jobs are **self-describing containers**; metadata rides as image **labels** in the `llmretro.job.*` namespace, baked at build with `LABEL`:
  - `.title`, `.description`
  - `.stage` — `import` | `analysis` (extensible)
  - `.params` — a single **JSON-schema** label driving a generic trigger form
  - `.depends-on` — reserved for cross-Job ordering (see §7.5)
- The **web app is the discovery provider**: it queries the Docker API for images by label namespace (works with zero Job containers running — the _image_ is present) and renders them. Job containers are **off by default** via compose **profiles**, so `docker compose up` brings up only `web`+`db`.
- **Adding a Job type = ship a labelled image.** No web-app change, no central registry edit. This is the extension unit for every deferred type.

### 2.4 Tech stack — polyglot via containers ([ADR-0003](../adr/0003-polyglot-python-jobs-sveltekit-web.md))

- **Jobs → Python** (shared thin job-base image). Data-wrangling now; every deferred Job type (ML, notebooks, embeddings) is Python-centric.
- **Web app → SvelteKit** (full-stack TypeScript). Server routes hold **Postgres access + the Docker socket** (`dockerode`) for image discovery and one-shot launch; reactive frontend for the two coordinated Viewers; charts via a JS lib (ECharts used in the prototype).
- **Postgres is the language-neutral contract** between the Python and TypeScript worlds.
- **Socket authority:** the SvelteKit Node server owns the Docker socket directly (fewest services). A thin dispatcher service is the reserved hardening seam if this ever goes multi-user/network-exposed.

### 2.5 Compose shape

- **Base (always up):** `db` (Postgres+pgvector), `web` (SvelteKit, holds the Docker socket).
- **Jobs:** labelled Python images, off by default (profiles), one-shot on trigger.

---

## 3. Normalised Session Model

Fixed by [#3](https://github.com/jonnyasmith/llm-retro/issues/3), grounded in the data inventory ([#2](https://github.com/jonnyasmith/llm-retro/issues/2), full findings on branch `research/session-data-inventory`). The model is **lossless-core + verbatim-`raw`**: extraction is mechanical 1:1; all interpretation is deferred to analysis Jobs. Rationale in [ADR-0005](../adr/0005-normalised-session-model-lossless-core-plus-raw.md) (lossless-core + `raw`, per-message model, Codex `basis`), [ADR-0006](../adr/0006-turn-is-a-derived-signal.md) (`Turn` derived, not stored), [ADR-0007](../adr/0007-subagent-runs-are-first-class-sessions.md) (sub-agents as first-class Sessions).

### 3.1 Two layers

- **Typed core** — universal, present-or-null for all three Tools.
- **Verbatim `raw`** — on every record, holding the original source object. Extraction is lossless; unpromoted fields (Codex git commit, Claude permission mode, pi cost/`thinkingSignature`, Claude cache 5m/1h sub-splits, schema-drift fields) stay recoverable without re-reading 1.8 GB. Trade-off: `raw` ~doubles on-disk size; accepted (disk cheap, re-extraction not; `raw` is droppable for cold Sessions since source files persist).

### 3.2 Session (core fields)

`{ id, tool, kind, cwd, project, git_branch, started_at, source_path }`

- `id` = Tool-native UUID; store-wide uniqueness is **`(tool, id)`**.
- `kind` = `primary` | `subagent`. Codex is always `primary`.
- `git_branch` nullable (pi has none).
- Every Session carries `source_path`.
- **No session-level model** — Sessions are multi-model-capable (model is per-Message).

### 3.3 Message (core fields)

`{ session_id, index, native_id, role, timestamp, model, content[], usage }`

- Addressed by composite **`(session_id, index)`** — `index` is 0-based, per-Session, a **total order** (the spine).
- `native_id` nullable — Tool-native id where one exists; **Codex `native_id: null`** (no stable per-message id in source).
- `role` = `user` | `assistant` | `tool_result`.
- `timestamp` unified to **ISO-8601 UTC** (pi nested epoch-ms converted). Ties broken by `index`, not timestamp.
- `model` — per-Message **effective** id via carry-forward: Claude direct; Codex latest `turn_context.model` carried forward; pi per-message (message-level wins over `model_change` on divergence). Stored **verbatim, Tool-native** — no cross-Tool aliasing (that is analysis-time).

### 3.4 Content — closed block set

`text` · `reasoning` · `tool_call` · `tool_result` · `image`.

- `reasoning` may be **presence-only** (pi `thinking` encrypted; Claude breaks out none) — the block's presence is itself Signal.
- `tool_call` block: `{ id, name, input }` — `input` parsed to JSON (Codex `arguments` JSON-string → parsed).
- `tool_result` block: `{ tool_call_id, output, is_error }` — `is_error` normalised from Claude `is_error` / Codex exit-code-in-text / pi `isError`; raw output preserved.
- Tool calls join on the **Tool-native `call_…` id**; pi's compound `call_…|fc_…` split on `|` to align with Codex. **No synthetic ids invented. Orphan calls tolerated** (unmatched `tool_call` kept, result absent; never dropped).
- Results stay **in stream position** as their own `role: tool_result` Message (spine stays flat).

### 3.5 Sub-agents

- A sub-agent run **is a first-class Session** with `kind: subagent`, `parent_session_id`, `parent_tool_call_id` (pointing at the spawning `Task`/`subagent` tool call). Every analysis Job works on sub-agents for free.
- Claude's parent link reconstructed from the file-tree join at ingest; **dangling links tolerated** (pi retains almost no sub-agent files on disk).

### 3.6 Usage / tokens

- Nullable per-Message `usage { input, output, cache_read, cache_write, reasoning }` + a **`basis`** flag = `per_message` (pi/Claude) | `reconstructed` (Codex).
- pi/Claude map directly (Claude `cache_creation` → `cache_write`, 5m/1h sub-splits collapsed, split kept only in `raw`).
- **Codex reconstructed by diffing consecutive cumulative snapshots**; where snapshots are `null`, `usage` is **absent, never zero**. `basis` makes Codex's approximate fidelity explicit.

### 3.7 Cost — excluded

**Not a model field, not a v1 Signal.** Tokens (`usage`) is the economic metric. No price tables, no cost derivation in v1. pi's native cost survives incidentally in `raw` only. (See §9.)

### 3.8 Record classification — three buckets (auditable, never silent)

- **→ Message** (spine): user/assistant/tool-result records. Claude `user`/`assistant`; Codex `response_item` of `message`/`function_call`/`function_call_output`/`reasoning` (standalone `reasoning` merges into the following assistant Message); pi `message`.
- **→ Session metadata** (core/`raw`, not spine): Claude `summary`; Codex `session_meta`+`turn_context`; pi `session`+`model_change`+`thinking_level_change`.
- **→ Dropped but counted**: Claude `queue-operation`/`ai-title`/`last-prompt`/`custom-title`; Codex `ghost_snapshot`+`event_msg` echoes; orphaned `attachment`. Extraction **reports N dropped per Session**.

### 3.9 Ordering & extraction notes (per Tool)

- Claude: walk `parentUuid`, keep the **actually-walked final path** (retry branches dropped); original pointers to `raw`.
- Codex: file order after **de-duping** the `response_item`/`event_msg` pair (keep `response_item`).
- pi: linearise the `parentId` tree.

### 3.10 Analysis-time derivations (NOT stored in the model)

`Turn`, cost, cross-Tool model families — all derived by analysis Jobs, keeping the store faithful to "what the transcript contains."

---

## 4. Signals (deterministic analysis layer)

Fixed by [#4](https://github.com/jonnyasmith/llm-retro/issues/4). A **Signal** is a deterministic structured fact — a pure function of one Normalised Session: exact, cheap, re-runnable, **no model call**. Interpretive facts are Inferences (§5), not Signals. The deterministic-Signal / interpretive-Inference boundary is fixed in [ADR-0008](../adr/0008-signals-deterministic-inferences-interpretive.md).

Eight v1 Signals:

1. **Turn count** — number of derived Turns (Turn derivation is itself an analysis Job, per §3.10).
2. **Token usage** — Σ per-Message `usage`, split input/output/cache; **`basis` preserved** so reconstructed (Codex) totals stay visibly distinct from exact ones.
3. **Model mix** — per-Message effective `model` aggregated: which models ran and each one's share of Messages/tokens (subsumes "model-per-phase").
4. **Subagent usage** — count of child Sessions (via `kind`/parent link) and their rolled-up token cost, absolute and as a share of the whole tree's tokens.
5. **Tool usage** — count and breakdown of `tool_call` blocks by tool name.
6. **Session duration** — wall-clock span first→last Message. A **session-shape axis** (compare "3×30-min loops" vs "1×90-min loop"), not a quality headline.
7. **Response latency** — per **model-response** gap: `timestamp(assistant msg) − timestamp(immediately preceding user-input or tool_result)`. Excludes `assistant → tool_result` (tool-execution) gaps, so long unattended loops don't masquerade as slowness. Stored per measurement: **UTC instant, measured latency, and the response's output-token count**. The Viewer buckets by hour-of-day in a configurable tz (default `Europe/London`, DST-aware) and can normalise to a **latency-per-output-token rate** (the only form that proves "the model is slower" rather than "it wrote more"). Serves the "Claude is slower in the afternoon" hypothesis.
8. **Active model time** — Σ per-response latency across the Session: the honest work-cost (loop/tool idle excluded).

**Excluded from v1:** corrections/re-prompts (→ Inference, §5); full-turn wall-span (dominated by tool-execution time; easy to add later).

**Feasibility:** all three Tools stamp every record with ISO-8601 UTC at append time (commit/completion semantics), making (7) and (8) deterministic.

---

## 5. Inferences (LLM analysis layer)

Fixed by [#6](https://github.com/jonnyasmith/llm-retro/issues/6); mechanism in [ADR-0004](../adr/0004-inferences-via-subscription-authed-cli-in-container.md). An **Inference** is an interpretive judgement requiring a model pass. Signals stay the deterministic source of truth; Inferences are **model-derived and non-authoritative**.

### 5.1 v1 Inference Jobs

- **Per-session** (LLM) — one **self-describing image per type** (§2.3), each reading the raw transcript once, independently versioned/re-runnable:
  1. **Course-corrections**
  2. **Input-noise waste**
  3. **Dumb-zone detection** — judge whether/where quality degraded, record cumulative context-tokens at that point (null if never).
- **Cross-session** (`depends-on` the per-session layer, reading the **structured layer only** — Signals + per-session Inferences, never raw text):
  - **Thematic synthesis** (LLM) — map-reduce over the structured layer → themes. (Embeddings/`pgvector` reserved, not used.)
  - **Dumb-zone aggregate** (**deterministic**, no second LLM pass) — distribution over per-session detection points → the threshold.

### 5.2 Model pass mechanism ([ADR-0004](../adr/0004-inferences-via-subscription-authed-cli-in-container.md))

- A **subscription-authed agent CLI, headless, inside the §2.3 one-shot Job container**: default `claude --print --output-format stream-json`, input piped on stdin, authed by `CLAUDE_CODE_OAUTH_TOKEN` (minted via `claude setup-token`, injected as env — no metered API key, no credential mount). Frontier quality, **zero metered cost**, runs local. Pattern from `~/dev/sandcastle`. Ollama = optional fallback.
- CLI + model is a per-Job `llmretro.job.params` value, **stored per-Job in Postgres, editable from the web UI**, injected at launch. No new mechanism beyond §2.3's param seam.

### 5.3 Reproducibility (reconciles LLM output with §7.4 deterministic re-run)

- **Stamp-gated recompute:** an Inference recomputes only when its stamp `(model, prompt-version, extractor-version)` changes or the source Session changes. Re-trigger on an unchanged stamp = **no-op** (no silent history rewrite, no wasted calls).
- **Provenance:** each Inference row stores its stamp + the raw model response (or a pointer).
- **Fail-loud structured output:** single-shot structured mode (tagged block); malformed/unparseable = bounded-retry then **job failure**, never a silently-stored partial.

---

## 6. Viewers

Two Viewers over **one** extracted dataset — not two subsystems. Pinned by the working prototype `docs/prototypes/metrics-viewer.html` (branch `prototype/metrics-viewer`); fold the winning design into the real SvelteKit app at build.

### 6.1 Shared shell (coordination — [#7](https://github.com/jonnyasmith/llm-retro/issues/7) ↔ [#8](https://github.com/jonnyasmith/llm-retro/issues/8))

- **Single flat header nav — Overview · Sessions · Insights · Jobs** — the sole router, URL-stable via `?view=` (reload/share-safe).
- **Tool/model/date filters persist across every view.**
- **Selection persists** across views; cross-links both ways (`View metrics →` from an Inference to the Session's Signal breakdown, and Session detail → Insights).

### 6.2 Metrics Viewer ([#7](https://github.com/jonnyasmith/llm-retro/issues/7)) — quantitative, surfaces all 8 Signals

- **Overview** — question-driven layout, full width. **Hero: latency hour-of-day + latency-per-output-token** (the "afternoon slower" test). Then tokens/model-mix, session-shape, tooling. Session-shape scatter **drills into Sessions**.
- **Sessions** — master-detail: session list (Tool badge + latency sparkline + turns/tokens/duration) → full per-session Signal breakdown; cross-links to Insights.

### 6.3 Retro/Insights Viewer ([#8](https://github.com/jonnyasmith/llm-retro/issues/8)) — qualitative, renders the §5 Inference layer

- **Three nested layouts kept** (in-pane **Layout** switch, `?insight=A|B|C`); which is most useful is deferred until real extracted data exists to judge against:
  - **A · Digest** — opinionated retro report: findings grid → ranked themes with Session chips → dumb-zone aggregate chart.
  - **B · Workbench** — session-first master-detail with an **annotated transcript thread**; each Inference inline on its Turn.
  - **C · Explorer** — theme/pattern-first master-detail; select a pattern → its supporting per-session evidence, grouped by Session.
- Renders: per-session course-corrections, input-noise waste, dumb-zone detection; cross-session thematic synthesis; the deterministic dumb-zone aggregate threshold. Relevant Signals shown for context.

### 6.4 Inference output contract (the Viewer forces these fields concrete)

Each Inference card carries:

- `type`, `summary`, `confidence`
- **evidence excerpt** (for input-noise: a heard→meant diff)
- **reference back to evidence**: `Turn N · <sessionId>:M<k>` (the jump-to-Turn affordance)
- **provenance stamp**: `model · prompt-version · extractor-version · ran-at` (the §5.3 recompute-gating stamp)
- **model-derived · non-authoritative** marker (per-card + page banner) — Signals remain the source of truth.

Evidence linking: jump from an Inference to its Turn (Workbench); themes/patterns drill to the Sessions behind them (Explorer/Digest).

### 6.5 Jobs Viewer (control plane, §2)

Self-describing Job cards grouped by `.stage` (import / analysis), each with **Trigger** (generic form from the `.params` JSON-schema) and a **"Run pipeline"** convenience (import → analysis as sequential one-shots). Obviously-invalid actions greyed out (e.g. analysis on an empty store).

---

## 7. Re-run, incrementality & ordering

Fixed by [#5](https://github.com/jonnyasmith/llm-retro/issues/5); LLM reconciliation in §5.3.

1. **Source watermark table** — each transcript tracked by `source_path` + change key (content hash / mtime+size); import processes only new/changed files.
2. **Idempotent upserts** on model identities — Session `(tool, id)`, Message `(session_id, index)` — so reprocessing never duplicates.
3. **Job-run ledger + output versioning** — Signals/Inferences stamped with the producing Job's version; analysis recomputes for a Session when its extraction changed or the Job version bumped, else skips (self-invalidating derived data).
4. **`force-reprocess` param** bypasses watermarks for a clean rebuild.
5. **Dependency ordering — manual + guardrails.** No DAG scheduler in v1; the web app groups by `.stage`, triggers explicitly, offers "run pipeline". The `.depends-on` label seam is reserved so a branching graph (ML → index → conversational) adds edge-declarations + a resolver later without redesign.

---

## 8. Build sequence (suggested, incremental)

1. **Compose skeleton** — `db` (Postgres+pgvector) + `web` (SvelteKit shell), profiles wired; empty schema migration.
2. **Schema** — Session/Message (+`raw`), watermark table, job-run ledger, Signals table, Inferences table (with provenance stamp).
3. **Import Job (Python image)** — per-Tool extractors → Normalised Session Model, three-bucket classification with dropped-count reporting, idempotent upsert, watermarking. Label the image (§2.3).
4. **Docker-API discovery + Jobs Viewer** in the web app (`dockerode`): list labelled images, render trigger forms from `.params`, launch one-shot, tail status.
5. **Signal Jobs** — the 8 Signals (§4) incl. Turn derivation; version-stamped.
6. **Metrics Viewer** (§6.2) over real Signals; fold the prototype's Overview + Sessions design.
7. **Inference Jobs** (§5) — subscription-authed CLI in-container; stamp-gated recompute; provenance.
8. **Insights Viewer** (§6.3) — the three layouts over real Inferences; cross-links to Metrics.

---

## 9. Out of scope (v1)

Ruled beyond the destination; the framework reserves the seams (see §2) but v1 does **not** build them.

- **Cost / dollar-spend tracking** — tokens (`usage`) is the economic metric; no price tables or cost derivation. pi's native cost survives only in `raw`. (Decided in [#3](https://github.com/jonnyasmith/llm-retro/issues/3).)
- **ML Jobs, Jupyter integration, arbitrary indexing, the full conversational analyst** — deferred. Seams reserved: polyglot Python Job containers, `pgvector`, `.depends-on`, derived sidecar stores.
- **DAG scheduler** — manual stage-ordering + "run pipeline" only; `.depends-on` reserved.
- **Multi-user / network exposure** — single-user local; thin-dispatcher hardening seam reserved.
- **Full-turn wall-span Signal** — excluded (§4); addable later.

---

## Testing Decisions

- **Test external behaviour, not implementation.** The load-bearing correctness surface is **extraction fidelity**: feed each extractor a small, committed fixture transcript per Tool (Claude, Codex, pi) — including the tricky cases the inventory surfaced — and assert the resulting Normalised Session Model, not intermediate parser state.
- **Modules to test:**
  - **Per-Tool extractors** (Python import Job) — the highest-value tests. Cover: Codex `{type,payload}` envelope de-dup (`response_item` vs `event_msg`) and cumulative-snapshot diffing (incl. `null` → `usage` absent, not zero); Claude `parentUuid` walk with retry-branch drop and `cache_creation` collapse; pi `parentId` linearisation and epoch-ms→ISO conversion; the compound `call_…|fc_…` split; orphan-tool-call tolerance; three-bucket classification with correct dropped-count.
  - **Signal functions** (§4) — pure functions over a fixed Normalised Session fixture; assert exact values. Especially response-latency windowing (tool-execution gaps excluded) and hour-of-day tz bucketing (DST boundary).
  - **Re-run semantics** (§7) — idempotent upsert (double-import = no duplicate rows), watermark skip, version-bump recompute; and the §5.3 stamp-gated Inference no-op.
- **Inference Jobs:** do **not** assert model output content (non-deterministic). Test the _contract_ — output parses to the §6.4 shape, provenance stamp populated, malformed response fails loud (bounded retry then job failure), stamp-gated recompute is a no-op on unchanged stamp. Mock the CLI boundary.
- **Prior art:** the throwaway prototype (`docs/prototypes/metrics-viewer.html`) is the interaction reference for Viewer behaviour, not a test target. No test suite exists yet — establish Python (`pytest`) for Jobs and the SvelteKit default (`vitest`) for the web app as the first build step introduces each.

## Out of Scope

See §9. In short: cost tracking, ML/Jupyter/indexing/conversational analyst, DAG scheduling, multi-user/network exposure, and the full-turn wall-span Signal are all deferred beyond v1 — each behind a reserved seam, none built.

## Unresolved Questions

- **Overview section order/visibility** — fixed order in the prototype; decide at build whether user-configurable in v1 or later (flagged in [#7](https://github.com/jonnyasmith/llm-retro/issues/7)).
- **Insights layout selection** — all three (Digest/Workbench/Explorer) ship; the "which is primary" call is deferred until real extracted data/model outputs exist to judge against (flagged in [#8](https://github.com/jonnyasmith/llm-retro/issues/8)).
- **Inference provenance storage granularity** — per-Inference raw-response pointer vs per-run stamp; confirm when the Inference schema lands (flagged in [#8](https://github.com/jonnyasmith/llm-retro/issues/8)).
- **`raw` retention policy** — when/whether to drop `raw` for cold Sessions to reclaim disk (the model permits it; the trigger is unspecified).
