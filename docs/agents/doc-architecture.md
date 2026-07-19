# Documentation Architecture

A repeatable way to organise a repository's **agent-facing documentation** so an
agent loads the right guidance at the right moment and never carries more than
the current task needs. It targets monorepos worked at the **solution level**
— several working targets edited from one session — but the same unit collapses
cleanly onto a single-package repo.

Terms used throughout:

- **Context** — any node that owns a bounded domain: the repository root (the
  whole *solution*) or a **working target** nested inside it.
- **Working target** — a context nested in the solution: an app, package, or
  service you do real work in.

The pattern is recursive: every context has the same shape, so the structure
never has to be re-invented as the repo grows.

> Examples in this document are drawn from a real monorepo (a SvelteKit `web`
> app, a `db` store-of-record, and a `jobs` context) and are marked as examples.
> They illustrate the system; they are not part of its definition.

## The problem this solves

The common layout assumes a mostly single-context repo: one root glossary, a
decisions folder, and — for monorepos — a central map file that routes to nested
glossaries, plus a separate file holding the rules for reading them. Driven at
the solution level, that breaks down in two ways:

- A central map file is a **passive router** the agent must be told to read, and
  it drifts from the tree it describes.
- Reader-rules and per-target conventions have no consistent home, so every new
  package becomes a judgement call.

## The core idea: one recursive unit

Every context — root and working target alike — has the **same shape**:

```
<context>/
├── AGENTS.md          ← this context's working instructions + a routing section
└── docs/
    ├── adr/           ← decisions scoped to this context (immutable, numbered)
    └── agents/        ← everything the agent reads here:
        ├── domain.md  ← this context's domain vocabulary (the glossary)
        └── …          ← conventions / process ("agents files")
```

The unit repeats and matches at every level; only *content* and *reach* change,
never *structure*. Nesting is **arbitrary-depth** — a working target that grows
its own sub-targets routes down to them exactly as the root routes to it. A
two-level repo (solution → targets) is just the common case.

> **Naming note.** The glossary is `domain.md`, not `CONTEXT.md`. "Context" is
> the structural unit here (the root, or a working target), so a file named
> `CONTEXT.md` would collide with that meaning. `domain.md` names the content
> precisely and matches the domain-modeling discipline that maintains it.

> **Example.**
> ```
> /                     ← solution
> ├── AGENTS.md
> ├── docs/adr/ · docs/agents/domain.md
> ├── web/              ← working target: a SvelteKit app
> │   ├── AGENTS.md         lint + verify gate; routes to a design-system convention
> │   └── docs/adr/ · docs/agents/{domain.md, design-system.md}
> ├── db/               ← working target: the store of record
> │   ├── AGENTS.md         the forward-only-SQL migration invariant
> │   └── docs/adr/ · docs/agents/domain.md
> └── jobs/             ← working target: self-describing job containers
>     ├── AGENTS.md         the label contract; jobs talk only via Postgres
>     └── docs/adr/ · docs/agents/domain.md
> ```
>
> An *embryonic* target — one too new to own a decision or a verify gate —
> carries only `docs/agents/domain.md` and is reached by a direct in-route from
> its parent until it earns an `AGENTS.md` (see **Growth and maintenance**).

## The root instructions file

Every harness auto-loads one root instructions file at session start — the one
file guaranteed to be in context. The canonical name is `AGENTS.md`. Where a
harness reads its own filename instead (e.g. Claude Code's `CLAUDE.md`), make
that a **one-line shim that imports `AGENTS.md`** (`@AGENTS.md`), so every
harness loads the same single source and there is nothing to keep in sync.

## `AGENTS.md`: instructions **plus** a routing section

`AGENTS.md` is the entry point for its context. It is **not** a pure router — it
holds that context's normal agent instructions, and *one* of its sections is a
router.

- **Instructions** — whatever an agent must know to work in this context: its
  invariants, verification gate, and conventions that are always relevant here.
- **Routing section** — points at the deeper files and **forces lazy loading**:
  the agent reads a target only when the current task needs it, instead of
  pulling everything up front.

```markdown
# <context> — Agent Guide

## Instructions
- <this context's always-relevant working rules: invariants, verify, lint…>

## Routing — read only what the task needs, when it needs it
- <label> → <file>
```

> **Example.** A root `AGENTS.md` carries the commit protocol and review loop; a
> `web/AGENTS.md` carries its lint + verify gate and "all UI composes the design
> system"; a `db/AGENTS.md` carries how to verify a migration in a sandboxed
> container.

### Routing points two directions

- **Down** (only at levels that have children): each working target → its own
  `AGENTS.md`.
- **In** (every level): this context's `docs/agents/domain.md` (vocabulary),
  `docs/adr/` (decisions), and its other `docs/agents/*` conventions.

> **Example — root routing section:**
> ```markdown
> ## Routing — read only what the task needs, when it needs it
> ### Working targets
> - Working on the web app or any UI change → web/AGENTS.md
> - Working on the store of record / a migration → db/AGENTS.md
> ### This (solution) context
> - Solution-wide vocabulary → docs/agents/domain.md
> - System-wide decisions → docs/adr/
> - Issue tracker / triage / planning → docs/agents/
> ```
>
> **Example — a working target's routing section:**
> ```markdown
> ## Routing — read only what the task needs, when it needs it
> - Vocabulary (solution-wide terms → ../docs/agents/domain.md) → docs/agents/domain.md
> - Decisions → docs/adr/
> - Design system → docs/agents/design-system.md
> ```

## Why routing is load-bearing

Because work happens at the solution level, you can only **rely on** the root
`AGENTS.md` being loaded. Nested `AGENTS.md` files are reached by **explicit
routing from the root**, not by the harness noticing a working directory. The
chain is lazy at every hop:

1. Root `AGENTS.md` is always in context.
2. Its routing section sends the agent into a target's `AGENTS.md` **only** when
   the task touches that target.
3. That target's routing section sends the agent into a specific `domain.md` or
   ADR **only** when the task needs that vocabulary or decision.

Nothing below the root is paid for until a task walks the path to it. The
directory tree *is* the map; each `AGENTS.md` is the local index for its level.
There is no separate map file to maintain, and no reader-rules file — the "how
to read the docs" rules are ordinary instructions in the root `AGENTS.md`,
stated to apply at every level.

## How loading works: always-on vs lazy

Progressive disclosure needs two things: a small layer that is **always in
context**, rich enough to decide where to go, and detail that stays on disk
until a decision points at it. Agent Skills are the reference implementation,
and this routing copies the mechanism with plain files.

### The Skills parallel

| Skills | Here |
| --- | --- |
| Every skill's `name` + `description`, injected at startup (always on, cheap) | Root `AGENTS.md` — invariants + routing section, auto-loaded by the harness |
| Full `SKILL.md` body, read when the description matches the task | A target's `AGENTS.md`, read when a routing line matches the task |
| Files the `SKILL.md` references, read even later | `domain.md`, a specific ADR, a convention file — read when the target's routing points at them |

The root `AGENTS.md`'s routing section **is** the always-loaded index of
"descriptions", and each routing line is a trigger that gates a lazy read —
exactly how a skill's description gates loading its body. Three tiers, each paid
for only when the path is walked:

1. **Tier 0 — always on:** root `AGENTS.md`. The harness injects it every
   session; it is the only thing guaranteed loaded.
2. **Tier 1 — loaded when routed to:** a working target's `AGENTS.md`. Not
   auto-loaded; pulled in by an explicit read when a root routing line matches.
   Once loaded it becomes the local index for the rest of that target's work.
3. **Tier 2 — loaded on demand:** `domain.md`, ADRs, conventions — read when the
   target's own routing points at them.

### What goes always-on vs lazy — the test

Ask: *is this needed on every task, whatever path it takes?*

- **Yes → always-on.** Write it into root `AGENTS.md`: the non-negotiable
  invariants (commit protocol, review loop, the standing read-rules below) and
  the routing index itself.
- **No — only when the task touches area X → lazy.** Put it behind a routing line
  whose trigger names X: a target's conventions, vocabulary, decisions.

Keep Tier 0 small. "Always on" is a budget paid on every task, so root
`AGENTS.md` earns its place with universal invariants + routing only; everything
else sits behind a pointer.

### What makes lazy loading actually fire

Lazy loading is only as reliable as the trigger that gates it — the same lesson
as a skill with a weak `description` that never activates.

- **Write routing lines as triggers, not labels.** State *when* to read the
  target, in task terms — "Working on the web app or any UI change →
  `web/AGENTS.md`" — not "web docs → `web/AGENTS.md`". The condition is what lets
  the agent match task → path. This is the direct analogue of a skill's
  `description`. *(Exception: the two core files below carry their trigger in a
  standing rule instead, so their routing line is just a where-pointer.)*
- **State the policy explicitly.** The routing header says "read only what the
  task needs, when it needs it", so the agent neither greedily reads everything
  nor ignores the pointers.
- **Recurse.** Each target's `AGENTS.md` is its own Tier-0 index once loaded:
  instructions + a routing section to its `domain.md` / `adr` / conventions.

### The loading contract

Reach nested guidance by **explicit routing** — a read triggered by a routing
line — because that is harness-agnostic and works even while reasoning at the
solution level before any file is opened. Some harnesses *also* auto-inject a
subdirectory's `AGENTS.md` when you open files in that subtree; treat that as a
**bonus, never the mechanism**. Designing for explicit routing means the system
behaves the same whether or not a given harness does subtree auto-loading.

## Loading rules for the core files

Two files recur in every context that has substance: the glossary (`domain.md`)
and the decision log (`docs/adr/`). Their *when-to-load* logic is identical at
every level, so it is not repeated per context. Instead:

- **The "when" is a standing rule** in root `AGENTS.md`, stated once and declared
  to apply at every level. It lives in the Instructions section as an invariant.
- **The "where" is a thin pointer** in each context's routing section, naming
  that context's own copies.

Together they form the trigger: the standing rule says *when* in a task to reach
for the glossary or a decision; the routing line says *where* this context keeps
them. (This is why the two core files are the exception to "triggers, not
labels" above — their trigger is hoisted, so the routing line is a bare pointer.)

### `domain.md` — read before you name

Standing rule (root `AGENTS.md` instructions, applies at every level):

> Before writing anything that names a domain concept — an issue title, a test
> name, a proposal, a hypothesis, a commit message, ADR wording — read the
> `domain.md` for the context you are working in, plus the root `domain.md` for
> solution-wide terms. Use its exact terms; avoid the synonyms it lists under
> _Avoid_. If a concept you need is not defined, that is a signal: either you are
> inventing language the project does not use (reconsider), or there is a real
> gap (note it for domain-modeling — do not silently coin a term). Skip only for
> tasks that produce no domain-named output (e.g. a dependency bump).

Per-context pointer (each `AGENTS.md` routing section):

> - Vocabulary → `docs/agents/domain.md` (solution-wide terms → `../docs/agents/domain.md`)

`domain.md` is a single small file, so it is read whole; the only selection is
*which* context's glossary — already handled by the routing you walked to get
here.

### `docs/adr/` — read before you decide or diverge

Standing rule (root `AGENTS.md` instructions, applies at every level):

> Before proposing an architectural change, or working in an area governed by a
> decision, scan the `docs/adr/` filenames for the context (they are titled) and
> read only the ones touching your area — the root `docs/adr/` for system-wide
> decisions, the target's for its internal ones. If your output would contradict
> an ADR, surface it explicitly ("Contradicts ADR-0002 (use UTC for all
> timestamps) — but worth reopening because…") rather than silently overriding it.

Per-context pointer (each `AGENTS.md` routing section):

> - Decisions → `docs/adr/`

Unlike the glossary, `docs/adr/` is a *directory* of many files, so it has its
own cheap index tier: the **titled filenames**. The agent lists them (cheap),
then loads only the relevant bodies (lazy). This works only if filenames state
the decision — e.g. `0002-use-utc-for-all-timestamps.md`, not `0002-adr.md`.
Descriptive ADR filenames are therefore a requirement, not a nicety: they are
the index that makes ADR loading progressive.

## What lives where

| File | Holds | Scope test |
| --- | --- | --- |
| `AGENTS.md` | This context's working instructions + routing to its deeper files. | Always relevant when working in this context. |
| `docs/agents/domain.md` | Domain vocabulary (the glossary). Root = solution-wide terms; a target = its inner terms, deferring solution-wide terms upward with a one-line pointer. | "What do the words mean here?" |
| `docs/adr/` | One hard-to-reverse decision per file. | Root = affects more than one context or the system; a target = internal to that target (**blast radius**). |
| `docs/agents/*` (besides `domain.md`) | Repeatable conventions / process (design system, verification recipe, issue tracker, triage, planning). | "How do we operate, here?" |

The buckets never overlap: vocabulary never leaks into ADRs, decisions never
leak into the glossary, process never leaks into either, and `AGENTS.md` routes
to all of them rather than absorbing them. `docs/agents/` is the context's
**reference library** — its glossary (`domain.md`) and its conventions — while
`docs/adr/` stays separate because decisions are immutable and numbered.

## Growth and maintenance

A context earns files as it gains substance; the *shape* is fixed, a context
simply fills it in.

- **Files are created lazily** — when a term or decision is actually resolved,
  never scaffolded empty. `domain.md` is maintained by the domain-modeling
  discipline; ADRs are appended when a decision is made; conventions are written
  as they emerge. A missing file means "nothing to say yet", not "incomplete".
- **A down-route always lands on an `AGENTS.md`.** A context becomes a named
  routing target only once it has one — even a thin `AGENTS.md` that only routes
  in. Before that, it is too embryonic to be a target; reach its `domain.md`
  directly as an in-route from the parent if needed.

## Out of scope

- **PRDs, specs, and implementation plans** are ephemeral implementation detail,
  not part of this architecture. They come and go with the work; a repo may keep
  them wherever it likes (its issue tracker, a scratch area). They are not
  modelled here.
- **Human-facing `README`s** are separate. This system governs only agent-facing
  documentation.
