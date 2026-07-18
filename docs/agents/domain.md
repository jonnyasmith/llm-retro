# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

This repo is **multi-context** (a monorepo): start at **`CONTEXT-MAP.md`** at the root — it holds
the shared kernel and points to one `CONTEXT.md` per context (top-level app dir, e.g. `web/`). Read
the map plus the context doc(s) relevant to your topic.

- **`docs/adr/`** — system-wide decisions; read the ADRs that touch the area you're about to work in.
- **`<context>/docs/adr/`** — context-scoped decisions (e.g. `web/docs/adr/`); read these too when
  working inside that context.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo (multi-context — `CONTEXT-MAP.md` present at the root; contexts are top-level app dirs):

```text
/
├── CONTEXT-MAP.md                     ← shared kernel + context map
├── docs/adr/                          ← system-wide decisions
├── web/
│   ├── CONTEXT.md                     ← web-specific language
│   └── docs/adr/                      ← web-scoped decisions
├── jobs/                              ← CONTEXT.md added lazily
└── db/                               ← CONTEXT.md added lazily
```

A single-context repo instead keeps one `CONTEXT.md` + `docs/adr/` at the root, with no
`CONTEXT-MAP.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
