# 06 — Jobs screen

**Parent:** `.scratch/first-harness-end-to-end/spec.md`

**What to build:** The user triggers a Claude ingest from the app and watches it run — live progress, a streaming log, the terminal outcome, and a history of past runs — without touching the command line (S5).

**Blocked by:** 01 (a dispatchable `(ingest, claude)` job to run and watch).

**Status:** ready-for-agent

- [ ] A `POST` endpoint dispatches `(ingest, claude)` and returns the run's correlation id (mirroring the stub endpoint); re-dispatching while a Claude ingest is running returns the in-flight correlation id rather than starting a second run (ADR-0006).
- [ ] The Jobs screen lets the user trigger a Claude ingest and shows its live progress (files done of total, current file) and streaming log over the existing SSE stream, through to the terminal outcome (succeeded / failed / interrupted).
- [ ] The screen shows a history of past runs with their outcomes and timing, read from `job_run`.
- [ ] Reloading the page during an in-flight run reattaches to its progress stream (the run is persisted; ADR-0004).
- [ ] Tested: the endpoint returns a correlation id and re-dispatch of a running identity returns the same id (prior art: `src/routes/api/jobs/stub/server.test.ts`); the run-history read is covered at the store seam.
