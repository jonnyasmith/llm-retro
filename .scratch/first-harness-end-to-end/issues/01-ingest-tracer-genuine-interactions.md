# 01 — Ingest tracer: store genuine Claude Interactions

**Parent:** `.scratch/first-harness-end-to-end/spec.md`

**What to build:** The thinnest complete path from raw Claude logs to stored behavioural data. A Claude ingest Job, identity `(ingest, claude)`, that the user can dispatch and that walks every discovered Claude session file and stores one `Interaction` per genuine user prompt, each with its Model, tokens, and instant — so re-running is safe and produces no duplicates. This is the tracer bullet: it must store a real row through every layer, and later tickets thicken it.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A job handler registered under `type: 'ingest'`, `scope: 'claude'` discovers its own work at run time: enumerate `<claude source>/*/*.jsonl` for each configured Claude log source (`settings.logSourceOverrides.claude` falling back to the default), excluding `subagents/` files. Trigger payload is empty.
- [ ] Genuine-user-prompt detection: a new Interaction opens at a `type:"user"` record where `isSidechain` is not true, `isMeta` is not true, and content is text (string or text block) not a `tool_result`; slash-commands qualify. The noise types (`attachment`, `system`, `mode`, `permission-mode`, `file-history-snapshot`, `last-prompt`) and `isMeta`/`tool_result` user records never open an Interaction.
- [ ] An Interaction is stored only if at least one `assistant` record follows before the next genuine prompt; a genuine prompt with no assistant activity (e.g. `/clear`, abandoned prompt) is dropped.
- [ ] Each stored Interaction carries: main token buckets summed across its non-sidechain assistant records (`input←input_tokens`, `output←output_tokens`, `cache_read←cache_read_input_tokens`, `cache_write←cache_creation_input_tokens`; absent key → null, not zero); `model` canonicalised (strip `[…]` context suffix and trailing `-YYYYMMDD`) with verbatim `modelRaw`; the opening user record's `timestamp` as epoch-ms UTC plus `localDow`/`localHour`/`localDate` from `deriveLocalBuckets` and the configured timezone.
- [ ] Model selection: first assistant record's model; on disagreement, the model with the most `output_tokens`.
- [ ] A `Session` row is stored per file (`stableSessionId` = filename UUID, `logFilePath`, `startedAt`/`endedAt` = min/max record timestamp), idempotent on `UNIQUE(harness, stableSessionId)`.
- [ ] Project attribution goes through a new injected `cwd → { rootPath, gitRemoteUrl }` resolver seam; this ticket ships a literal-cwd implementation (rootPath = the recorded cwd, remote null) so every Interaction gets a `projectId`. The seam is what ticket 02 swaps.
- [ ] Interaction insertion is idempotent on `UNIQUE(sessionId, openingUserRecordId)`: re-running the job over unchanged files creates no duplicates.
- [ ] The handler emits `JobProgress` (`filesTotal` = session files, `filesDone` per completed session, `currentFile`) via the job context.
- [ ] Tested at the ingest-handler seam against a temp DB + fixture log tree: correct Interaction boundaries (genuine vs excluded records; response-less prompts dropped), token sums, model canonicalisation, instant + local buckets, and idempotent re-runs. Prior art: `src/lib/server/jobs/job-runner.test.ts`.
