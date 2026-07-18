# Domain Docs

How to consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

Start at **`CONTEXT-MAP.md`** at the root — a small index of the contexts and how they relate. Then read the **`CONTEXT.md`** of each context your task touches; that's where the ubiquitous language lives.

- **`docs/adr/`** — system-wide decisions. Read the ADRs that touch the area you're about to work in.
- **`<context>/docs/adr/`** — context-scoped decisions (e.g. `web/docs/adr/`). Read these too when working inside that context.

## Layout

```text
/
├── CONTEXT-MAP.md          ← context index + relationships
├── docs/adr/               ← system-wide decisions
├── web/
│   ├── CONTEXT.md          ← web language
│   └── docs/adr/           ← web-scoped decisions
├── jobs/
│   └── CONTEXT.md          ← jobs language
└── db/
    └── CONTEXT.md          ← database language
```

A new app follows the same shape: its own `CONTEXT.md` in the app dir, added to `CONTEXT-MAP.md`, plus a `docs/adr/` once it accrues context-scoped decisions. A context without a `CONTEXT.md` yet just has no bespoke language yet — proceed; `/domain-modeling` fills it in lazily as terms get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant context's `CONTEXT.md`. Don't drift to synonyms the glossary explicitly lists under `_Avoid_`.

If the concept you need isn't in any glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0008 (Signals deterministic, Inferences interpretive) — but worth reopening because…_
