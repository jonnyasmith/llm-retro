# Jobs — Agent Guide

Self-describing one-shot containers that turn raw Sessions into stored data (extraction) and derive facts from it (analysis and the insight layer). The root [`../AGENTS.md`](../AGENTS.md) applies here too — including its _read before you name_ and _read before you decide_ standing rules.

## Instructions

- A job type is a **self-describing container image** discovered by `llmretro.job.*` labels, not a plugin inside a shared runner: adding a job type = ship a labelled image, with no web-app or registry change. Jobs communicate only through Postgres — never directly with each other or with web. (Root ADR-0002.)

## Routing — read only what the task needs, when it needs it

- Vocabulary → `docs/agents/domain.md` (solution-wide terms → `../docs/agents/domain.md`)
- Decisions → `docs/adr/`
