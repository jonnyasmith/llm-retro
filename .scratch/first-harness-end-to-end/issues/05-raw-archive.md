# 05 — Raw archive

**Parent:** `.scratch/first-harness-end-to-end/spec.md`

**What to build:** History protection: during ingest, copy the untouched raw log files into an app-owned archive so the user's history survives a Harness pruning or rotating its logs, and stays re-ingestable later with a richer parser (ADR-0003). Toggleable and path-configurable.

**Blocked by:** 01 (the ingest loop).

**Status:** ready-for-agent

- [ ] When `settings.rawArchiveEnabled`, the ingest loop copies the untouched raw bytes of each session file (and its `subagents/*` siblings) to `settings.rawArchivePath` before parsing, so a parser failure still leaves the raw file copied.
- [ ] The archive mirrors the source directory layout so the copy can be re-ingested later.
- [ ] Copy-on-change: a file is archived when new or changed versus its archived copy (same `(size, mtime)` skip as the checkpoint); full-file overwrite, not incremental.
- [ ] When archiving is disabled, no files are copied and ingest behaviour is otherwise identical — correctness never depends on the archive.
- [ ] Tested at the ingest-handler seam: enabled → raw files (incl. sub-agent files) present under the archive path in mirrored layout; disabled → none; changed file re-archived, unchanged file skipped; stored Interactions identical with archiving on or off.
