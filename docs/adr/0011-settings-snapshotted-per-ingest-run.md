# Settings are snapshotted per Ingestion run

Each Ingestion run reads the effective application settings once, before it
enumerates any Log sources, and uses that snapshot for the entire run. A running
Job therefore keeps its starting Log sources, Raw archive configuration, and
timezone even if the user saves later settings; the next run picks up the new
values.

## Concurrency rule

A timezone change is rejected while any Ingestion run is active. Existing
Interactions are rebuilt transactionally when the timezone changes, so allowing
a run to continue with its older snapshot would let it append old-zone buckets
after that rebuild. The settings endpoint returns `409` and asks the user to
retry after Ingestion finishes.

Raw archive and Log source changes remain safe during a run because the active
run continues using its snapshot. They affect only the next Ingestion run and
cannot partially alter the current one.

## Configuration validity

Raw archive validity is enforced when settings are saved rather than when
Ingestion reaches its first source file. An enabled archive requires an absolute
root, and saving creates that directory recursively. This makes missing paths
and permission failures section-local settings errors instead of failures partway
through a long Ingestion run.

## Consequences

- A run is internally consistent even when settings are edited concurrently.
- Stored timezone and precomputed local-time buckets remain atomic.
- Settings saves need only query persisted Job-run status; dispatcher internals
  are not exposed to HTTP.
- Moving the timezone rebuild to a background Job would weaken this atomicity
  and is not part of this decision.
