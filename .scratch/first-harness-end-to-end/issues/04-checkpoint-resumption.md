# 04 — Checkpoint resumption

**Parent:** `.scratch/first-harness-end-to-end/spec.md`

**What to build:** Cheap, restart-safe re-ingest: a re-run reprocesses only new or changed records and resumes cleanly after an interrupted run, so ingesting a large history repeatedly costs almost nothing (ADR-0007).

**Blocked by:** 01 (the ingest loop and stored Interactions).

**Status:** ready-for-agent

- [ ] A `Checkpoint` row per session (`harness` + `stableSessionId`) records `lastCompleteRecordByteOffset`, `fileSize`, and `fileMtime` for the primary session file.
- [ ] On re-ingest, a primary file whose `(fileSize, fileMtime)` both match its checkpoint is skipped; otherwise parsing resumes from `lastCompleteRecordByteOffset`.
- [ ] A "complete record" is a line terminated by `\n`; a trailing partial line (file mid-write) is neither consumed nor checkpointed and is picked up once complete.
- [ ] Sub-agent files are re-read wholesale each run (not checkpointed); correctness rests on the Interaction idempotency key.
- [ ] Tested at the ingest-handler seam: grow a fixture file between runs (controlling `mtime` via `utimes`) and assert only new records are processed, that an unchanged file is skipped, and that a partial trailing line is deferred. Prior art: `src/lib/server/jobs/job-runner.test.ts`.
