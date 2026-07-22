# 04 — Live progress over SSE and a minimal trigger/watch UI

**What to build:** The user-facing thread of the runner — a way to start a Job from the browser and watch it happen live. The UI triggers the stub Job and streams its progress over Server-Sent Events: percentage complete, the file being processed now, a streaming log, and the terminal outcome. Reloading the page mid-run reattaches to the in-flight run rather than losing it. This is the minimal surface needed to prove the runner end-to-end from the UI; the polished Jobs screen is a later milestone.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] An SSE endpoint streams a run's progress events by `correlation_id` — a thin adapter over the runner's event source, not a second source of truth.
- [ ] Events convey live progress (`files_done`/`files_total`, current file) and a terminal `done` carrying final status.
- [ ] A minimal UI triggers the stub Job (fire-and-forget, receives the `correlation_id`) and opens the stream for it.
- [ ] The UI renders percentage complete, the current file, a streaming log, and the terminal outcome.
- [ ] Reloading the page mid-run reattaches to the in-flight run using the persisted `job_run` state and resumes streaming.
- [ ] WebSockets are not used; progress is one-directional server→UI push over SSE under `adapter-node`.
