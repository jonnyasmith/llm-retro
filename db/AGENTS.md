# Database — Agent Guide

The store of record: the Normalised Session Model and the SQL migrations every downstream context reads. The root [`../AGENTS.md`](../AGENTS.md) applies here too — including its _read before you name_ and _read before you decide_ standing rules.

## Instructions

- The schema is hand-written, **forward-only plain SQL** in `db/migrations/`, owned by neither language; the `web` service applies migrations on startup via an ordered runner + a `schema_migrations` ledger. Never write a down-migration — the store is disposable and re-derivable, so rebuild instead of reversing. (Root ADR-0005 · db ADR-0001.)

## Routing — read only what the task needs, when it needs it

- Vocabulary → `docs/agents/domain.md` (solution-wide terms → `../docs/agents/domain.md`)
- Decisions → `docs/adr/`
