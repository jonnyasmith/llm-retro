# Plan — Compose skeleton (PRD §8.1)

**Scope:** the first build-sequence item — a runnable stack with `db` (Postgres+pgvector) and `web` (SvelteKit shell), Compose profiles wired so `docker compose up` brings only `db`+`web`, and the migration runner wired with an empty/bootstrap migration. No Signals, Jobs, or Viewers yet.

**Grounding:** PRD §2 (architecture), §8.1; ADR-0001 (Postgres single source of truth), ADR-0002 (self-describing Job containers), ADR-0003 (polyglot: Python Jobs / SvelteKit web, web holds the socket), ADR-0009 (schema as neutral SQL migrations run by web).

## Decisions

- **Repo layout** — bare top-level service dirs: `web/`, `jobs/{base,import}/`, `db/migrations/`, `compose.yaml` at root; no monorepo meta-tool (single-user local doesn't need one); not nested under `src/` (`src/` is a single-package idiom, misfits a polyglot multi-image repo).
- **Schema ownership** — hand-written plain SQL in `db/migrations/`; `web` applies on startup via a small ordered runner + `schema_migrations` ledger; forward-only (store is re-derivable, ADR-0009).
- **Postgres image** — `pgvector/pgvector:pg18-trixie` (Postgres 18 + pgvector 0.8.5), digest-pinned `@sha256:9d2e61c7352b9e9f4798df5fd9a498f043f4cda1cdacc707de3d198650f4321e`; `pgvector` extension present but unused in v1 (ADR-0001).
- **Data persistence** — named Docker volume mounted at `/var/lib/postgresql/data` (Portainer-managed, host-path-independent).
- **Web stack** — pnpm; `node:24-slim` base (Node 24 LTS; Debian slim avoids Alpine/musl native-module friction with `pg`/`dockerode`); `@sveltejs/adapter-node`; SvelteKit 2.70 / Svelte 5; TypeScript; scaffolded with `sv create`.
- **Runtime forced by ADR-0003** — Node (not Bun/edge): web must hold the Docker socket (`dockerode`) and a `pg` pool as a long-running server; adapter-node is the only adapter yielding that.
- **Docker socket** — direct read-write bind-mount of `/var/run/docker.sock` into `web` (read-write required: launching containers mutates). Effective host-root for web, accepted for single-user local (ADR-0003); socket-proxy/thin-dispatcher stays the reserved hardening seam. In-container Node needs socket permission (run as root or match host `docker` GID) — settle at build.
- **Compose profiles** — `db` + `web` in the default (always-up) set; Job services declared under Compose profiles so they are off by default (ADR-0002); no Job image is required for §8.1.
- **Config/secrets** — `.env` (gitignored) supplies Postgres creds and `DATABASE_URL`; env differs only by host: `localhost:5432` (dev) vs `db:5432` (in-stack). No `CLAUDE_CODE_OAUTH_TOKEN` yet (Inference concern, §8.7).
- **Dev inner loop** — `web` runs natively (`pnpm dev`, native Vite HMR) against a dockerised `db`; OrbStack exposes `/var/run/docker.sock` to host processes so native web still drives `dockerode`; `db` publishes `5432` to localhost. Migrations run via `pnpm migrate` in dev.
- **Prod/Portainer** — `web` is a built adapter-node container; entrypoint runs migrate then `node build`. Portainer deploys `compose.yaml` on demand.

## Steps

1. **Repo scaffold** — create `web/`, `jobs/`, `db/migrations/`, root `compose.yaml`, `.env.example`, extend `.gitignore` (`.env`, `node_modules`, build output).
2. **`db` service** — Compose service on the digest-pinned pgvector image, named volume, `5432` published to localhost for dev, healthcheck (`pg_isready`), creds from `.env`.
3. **Bootstrap migration** — `db/migrations/0001_init.sql` creating only the `schema_migrations` ledger (real tables are §8.2). Establishes the migration mechanism with an effectively empty schema.
4. **Migration runner (web)** — a small module that reads `db/migrations/*.sql` in lexical order, applies unapplied files in a transaction each, records them in `schema_migrations`; exposed as `pnpm migrate` and invoked at server startup (dev: manual/`pnpm migrate`; prod: container entrypoint before `node build`).
5. **`web` service** — `sv create` SvelteKit shell (adapter-node, TS), a placeholder route confirming DB connectivity (e.g. a server route that `SELECT 1`s via a `pg` pool), multi-stage Dockerfile (`node:24-slim`, pnpm), socket bind-mount, `depends_on` db healthy.
6. **Job profiles wiring** — declare a profile namespace in `compose.yaml` for future Job services so the default `up` excludes them; no concrete Job image built here.
7. **Smoke test** — `docker compose up` brings up only `db`+`web`; web startup applies `0001` (ledger row present); placeholder route returns DB-connected OK; `docker compose ps` shows no Job service running.

## Testing Decisions

- **What makes a good test here:** the skeleton's observable contracts are (a) migrations apply idempotently and are recorded, (b) the stack composes with only `db`+`web` by default. Test those behaviours, not framework internals.
- **Modules to test:**
  - **Migration runner** — the one piece of real logic. Unit-test against a throwaway Postgres (dockerised `db` or testcontainer): applying `0001` records a ledger row; re-running is a no-op (no duplicate application, no error); lexical ordering is respected. This directly exercises the ADR-0009 mechanism and prefigures §8.2/§8.7 re-run semantics.
  - **Compose profile behaviour** — assert (script-level, not unit) that the default profile set resolves to exactly `db`+`web` (Job services excluded). Cheap guard on the ADR-0002 "off by default" invariant.
- **Not worth testing yet:** the placeholder route beyond a manual smoke `SELECT 1`; SvelteKit scaffolding; Dockerfile build (covered by the smoke test running the stack).
- **Prior art / tooling:** none in-repo yet — this step establishes it. Per PRD Testing Decisions: `pytest` for Python Jobs (later) and the SvelteKit default (`vitest`) for the web app. Introduce `vitest` here for the migration runner.

## Out of Scope

- Any Job image (import or analysis) — §8.3+; only the profile wiring exists here.
- The real schema (Session/Message/`raw`, watermark, job-run ledger, Signals, Inferences) — §8.2.
- Docker-API image discovery and the Jobs Viewer UI — §8.4; `dockerode` may be a dependency but no discovery logic.
- The Metrics/Insights Viewers and any charts — §8.6/§8.8.
- `CLAUDE_CODE_OAUTH_TOKEN` and Inference-CLI plumbing — §8.7.
- Transcript source-directory mounting (read-only `~/.claude`, `~/.codex`, pi dirs) into Jobs — an import-Job concern (§8.3).
- Socket-proxy / thin-dispatcher hardening — reserved seam (ADR-0003), not built.
- Down-migrations — forward-only by decision (ADR-0009).

## Unresolved Questions

- **In-container socket permission** — run `web` as root vs match the host `docker` GID; decide at Dockerfile time against the OrbStack socket's ownership.
- **Migration transaction granularity** — per-file transaction (planned) vs per-run; per-file is safer and assumed unless a migration needs cross-file atomicity.
- **Digest-pin maintenance** — how/when to refresh the pinned pgvector digest (manual bump vs a later automation); out of scope to solve now, flagged so the pin doesn't silently rot.
