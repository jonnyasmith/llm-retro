# Schema as neutral SQL migrations, run by the web service

**Status:** accepted

The Postgres schema is defined as hand-written **plain SQL** migrations in `db/migrations/`, owned by neither language. The **web service applies them on startup** via a small ordered-migration runner backed by a `schema_migrations` ledger table. Migrations are **forward-only**.

ADR-0001/ADR-0003 make Postgres the language-neutral contract between the Python Jobs (which write Session/Message/`raw`, Signals, Inferences) and the SvelteKit web app (which reads). This decision keeps that contract genuinely neutral and gives it a home and an executor without adding a service.

## Considered Options

- **ORM-owned schema in the web app (drizzle-kit).** Rejected: defining the schema in TypeScript makes TS authoritative over the shared contract, forcing the Python Jobs to mirror it — the exact cross-language coupling ADR-0003 exists to avoid. The type-safety upside does not justify surrendering contract neutrality.
- **ORM-owned schema in the Jobs (Alembic/SQLAlchemy).** Rejected symmetrically: makes Python authoritative, forces web to mirror, and needs a Job/bootstrap container to run migrations — awkward at build step §8.1, before any Job image exists.
- **Dedicated one-shot migrate container (golang-migrate/Flyway).** Rejected for v1: cleanest separation, but adds a service against ADR-0003's "fewest services" preference, and is awkward to run at §8.1 before the Job-launch infrastructure exists. Reserved as a later extraction if migrations ever need to run independently of web.
- **Postgres `docker-entrypoint-initdb.d` init scripts.** Rejected: only run on a fresh data volume, so they provide no incremental-migration path.

## Consequences

- The one schema artifact is SQL that both languages read equally; neither generates the other.
- The web service — already the always-up base holding DB access — is the executor. Running DDL at startup is a bootstrap concern and does not make web a data writer, so "Jobs write / web reads" still holds.
- Migrations are forward-only: the store is disposable and re-derivable (ADR-0001), so down-migrations buy nothing — rebuild instead.
- No ORM query-generation from the schema; typed access on either side (if wanted later) layers over the existing schema by introspection, never by owning it.
- If migrations ever need to run independently of web (multi-user, CI, or a heavier ops posture), extracting the runner into a dedicated one-shot migrate container is a localised change — the SQL artifact and ledger are unaffected.

Decided during planning of build step §8.1 (Compose skeleton).
