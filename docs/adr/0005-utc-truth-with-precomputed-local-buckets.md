# Store UTC as the source of truth, precompute per-row local buckets

The headline activity view is a heatmap of **local** day-of-week × hour, in the user's configured timezone. We store each Interaction's instant as **epoch-milliseconds UTC** (the source of truth) and, at ingest, **precompute per-row `local_dow`, `local_hour`, and `local_date`** from that UTC value and the configured timezone. The heatmap is then a plain, fast `GROUP BY` over those columns.

## Considered options

- **Group by UTC buckets, translate in the UI.** Rejected as _incorrect_, not merely slower. Aggregating into UTC hour/day buckets discards the date — and the date is exactly what a correct local bin needs. DST means the UTC→local offset varies across the year, so one UTC bucket holds interactions belonging to different local hours _and_ different local days; and fractional-offset zones (UTC+5:30, +5:45) don't map bucket-to-bucket at all. No post-hoc shift can reconstruct the right bins.
- **Convert per-row in application code at query time.** Correct (each row still carries its full timestamp), but SQLite cannot do arbitrary-timezone conversion in SQL, so every heatmap load would pull rows into JS and aggregate there.

## Consequences

- The conversion happens **while each row still carries its full timestamp**, so it is DST-correct and fractional-offset-correct; the precomputed columns are just that correct conversion memoised so the hot query stays pure SQL.
- UTC remains the single source of truth, so the local columns are a derived cache. Changing the configured timezone is a **one-pass recompute from stored UTC — never a re-ingest** and never a re-read of the raw log files.
- The store carries three derived columns per Interaction. Accepted: it is consistent with the star-schema choice (a self-sufficient fact row) and it is what keeps the primary view fast and correct at once.
