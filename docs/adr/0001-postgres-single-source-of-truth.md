# Postgres as the single source of truth

**Status:** accepted

Postgres is the one canonical store for the normalised Session/Message data (including verbatim `raw`), derived Signals, and later Inferences. The store is treated as disposable and re-derivable: it rebuilds from the source transcripts, so migrating or blowing it away is cheap by construction. `pgvector` is available in the image but unused in v1, reserved for the future semantic-search / conversational analyst.

## Considered Options

- **SQLite** — the obvious pick for a single-user local tool (one file, zero ops, embeds anywhere). Rejected because the tool is a multi-service compose stack (web + db + jobs) and SQLite's one-file-many-writers model is its weak spot; defending it against concurrent container access would cost more design effort than adopting Postgres.
- **DuckDB** — columnar, ideal for the metrics aggregations. Rejected as the *canonical* store (weaker for incremental single-row writes) but retained as a future option: it can query Postgres directly if heavy OLAP is ever needed.

The usual Postgres ops cost is near-zero here: the tool runs as an on-demand Docker Compose stack with data mounted, which the operator already manages via Portainer.

## Consequences

- Specialised stores (Parquet/OLAP exports, vector indexes) are **derived job outputs**, never competing sources of truth. Everything rebuilds from Postgres.
- If the tool ever outgrows single-user-local (concurrency, remote access, pgvector at the core), the re-derivable store makes migration to a larger deployment cheap.

Decided in [#5](https://github.com/jonnyasmith/llm-retro/issues/5).
