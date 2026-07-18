# Jobs are self-describing one-shot containers, discovered by label

**Status:** accepted

Every Job (import, analysis, and future ML/index/etc.) is a container image that describes itself through labels in the `llmretro.job.*` namespace (Traefik-style): `.title`, `.description`, `.stage`, `.params` (a JSON-schema label driving a generic trigger form), and a reserved `.depends-on`. The web app is the discovery provider — it queries the Docker API for images by label namespace and renders them, off by default via Compose profiles. Triggering launches a one-shot container that does its work, writes to Postgres, and exits. There is no broker, queue, or always-on worker.

## Considered Options

- **Persistent worker + message broker** (Celery/RQ + Redis) — rejected: an always-on posture and an extra service, pre-paid against a continuous-ingestion need that a single user reviewing local files does not have.
- **Jobs as plugins inside one monolithic runner** — rejected: couples job dependencies into one image (an ML job's heavy deps bloat everything) and requires a core rebuild to add a job type.

## Consequences

- **Adding a job type = ship a labelled image.** No web-app change, no central registry edit. This is the single extension seam for all deferred job types.
- The **store is the decoupling seam**: the web app reads Postgres, jobs write Postgres, and they never communicate directly — so the stack can be brought up "view-only" (web + db) with no job running.
- Re-runs are made safe and incremental at the job level (source watermark + idempotent upsert + version-stamped outputs), independent of this container model.
- No DAG scheduler in v1; ordering is manual with guardrails plus a "run pipeline" convenience. The `.depends-on` label is reserved so a branching job graph can add a resolver later without redesign.

Decided in [#5](https://github.com/jonnyasmith/llm-retro/issues/5).
