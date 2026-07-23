# Provider is derived read-time from the canonical Model, never stored

Every other Interaction attribute — Model, token buckets, Project — is resolved during Ingestion and stored on the row. Provider is the deliberate exception: it is derived at read time by a pure `providerOf(canonicalModel)` prefix mapping (e.g. `claude-*` → anthropic, `gpt-*`/`o*` → openai), living beside the shared model-canonicalisation helper, with an unknown prefix falling back to `unknown`. Nothing writes a `provider` column.

The domain already treats Provider as "a derived attribute of Model, not its identity"; this records *where* and *when* that derivation happens.

## Considered Options

- **Store `provider` at Ingestion**, sourced from what the Harness logged (omp's raw logs carry provider explicitly). Rejected: it is the most faithful source but means threading a `provider` field through all four adapters and a schema migration, and a stored derived value goes stale the moment the mapping improves — for a single-user tool where Provider is display-only, the faithfulness is not worth the lock-in.
- **Read-time prefix mapping (chosen).** No storage, no migration, trivially reversible — fix the function and every view updates. The cost is recomputation per query, which is negligible at this scale.

## Consequences

- A future reader will notice Provider is absent from the store and computed in the read path; that asymmetry is intentional, not an oversight.
- The mapping is best-effort: models whose canonical name does not match a known prefix render as `unknown` rather than being mis-attributed.
