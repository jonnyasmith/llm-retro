# 02 — Analytical store schema, settings, and local-time bucketing

**What to build:** The normalised store that will hold the behavioural model — Project, Session, Interaction, and Checkpoint — plus a settings table for user preferences, and the helper that turns a UTC instant into the local buckets the activity heatmap groups by. After this ticket the schema can hold everything an adapter will later write, re-inserting the same Interaction identity collapses to one row, and local buckets are derived correctly across DST and fractional-offset timezones and can be rebuilt when the configured timezone changes. No parsing happens yet; correctness is proven directly against the store and the helper.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Drizzle schema + generated, committed migrations for Project, Session, Interaction, Checkpoint, and settings.
- [ ] Project identity is the local repository root path; git remote URL is a display attribute only (ADR-0002).
- [ ] Session natural key is (harness, stable session-id); Interaction denormalises `harness` and `project_id` (star schema, ADR-0001).
- [ ] Interaction carries `model` (canonical) + `model_raw` (verbatim), and eight nullable token columns `{main,sub}_{input,output,cache_read,cache_write}` where null means absent, never zero. Totals are not stored.
- [ ] Interaction carries `timestamp` as epoch-milliseconds UTC plus precomputed `local_dow`, `local_hour`, `local_date`.
- [ ] Interaction idempotency is enforced by `UNIQUE(session_id, opening_user_record_id)` on a surrogate integer primary key; re-inserting the same key collapses to one row.
- [ ] Checkpoint keyed by (harness, session-id) storing last-complete-record byte offset + file size + mtime.
- [ ] settings table holds user preferences (timezone, raw-archive toggle/path, log-source overrides) with sensible defaults applied until overridden (timezone defaults from the OS).
- [ ] Pure helper maps `(UTC, timezone) → local_dow/local_hour/local_date`; a recompute rebuilds those columns from stored UTC on timezone change without re-ingest.
- [ ] Tests: migrations apply; unique constraint collapses a duplicate to one row; null buckets round-trip as absent; bucketing correct across a DST boundary and a fractional-offset zone (e.g. UTC+5:30); TZ-change recompute rebuilds buckets from stored UTC.
