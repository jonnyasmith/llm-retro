# The job runner is a multi-job dispatcher keyed per identity, with a worker-thread seam

Background work runs through a **dispatcher that runs multiple Jobs concurrently**, each identified by a **type plus an optional scope** (e.g. `(ingest, claude)`, `(ingest, codex)`, later `(ml, embeddings)`). Concurrency is guarded **per identity**, not globally: starting a Job whose identity is already running refuses and returns the in-flight correlation id, while Jobs of different identities run in parallel.

## Considered options

- **A single global job lock (one Job at a time).** Rejected. The real hazard was never "two Jobs at once" — it was two runs of the *same* scope racing the *same* files. A global lock also needlessly serialises unrelated work (per-Harness ingests; future CPU-bound analysis) that has every reason to run in parallel.

## Consequences

- The per-identity guard kills the same-files race precisely, without constraining unrelated Jobs. Within one process on one connection, the synchronous, batched SQLite writes of concurrent Jobs interleave safely at transaction boundaries, and the Interaction idempotency key (ADR-0001) backstops any overlap.
- WAL mode is enabled so the UI and progress streams can read while a Job writes.
- A Job is modelled as a **dispatchable unit**, so a future CPU-bound Job type can be backed by a worker thread (with its own connection to the WAL'd database) **without redesigning the runner** — the case that a synchronous driver and a single event-loop thread would otherwise block. Only the in-process backend is built now; the seam is what this decision buys.
- A run left `running` by a crashed process is reconciled to `interrupted` at startup; interrupted Jobs are not auto-resumed — the user re-triggers, keeping Ingestion user-initiated (domain), and the Checkpoint makes the re-run cheap.
