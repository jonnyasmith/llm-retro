# 03 — Job runner: dispatcher, job_run, stub job, checkpoint mechanics, reconciliation

**What to build:** The background-job runner that later powers Ingestion — a dispatcher that runs Jobs identified by a type plus scope, records each run so history survives restarts, runs different job identities concurrently while refusing a second run of the same identity, and recovers cleanly when the process was killed mid-run. It is proven end-to-end by a stub Job that advances a Checkpoint and emits progress but writes no Interactions, so the whole runner contract is verified before the first real adapter exists.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `job_run` table: `type`, `scope`, `correlation_id` (UUID), `status`, `started_at`/`finished_at` (epoch-ms UTC), `error`, and coarse progress counters (`files_total`, `files_done`). Lifecycle `pending → running → (succeeded | failed | interrupted)`; no `cancelled` state.
- [ ] Dispatcher is a singleton initialised at server boot; treats a Job as a dispatchable unit so a future CPU-bound type can run on a worker thread without redesign (in-process backend only here).
- [ ] Per-identity concurrency guard: starting a `(type, scope)` already `running` refuses and returns the in-flight `correlation_id`; distinct identities run concurrently.
- [ ] Fire-and-forget trigger: starting a Job returns the new `correlation_id` immediately and never blocks on completion.
- [ ] Startup reconciliation flips any orphaned `running` rows to `interrupted`; interrupted Jobs are not auto-resumed (user re-triggers).
- [ ] `correlation_id` tags the run's logs and names its progress-event stream.
- [ ] Stub Job exercises the full contract: advances a Checkpoint (resume from offset, size/mtime short-circuit for an unchanged file, reset+re-read for a shrunk/replaced file), emits coarse progress, writes no Interaction rows.
- [ ] Tests (runner-contract, seam at the runner's event source not the transport): guard refuses duplicate and returns in-flight id while allowing a distinct identity concurrently; interrupt → startup reconcile → re-trigger → resume; checkpoint short-circuit and replaced-file reset; progress counters advance and a terminal event fires.
