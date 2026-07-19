# LLM Retro — Agent Guide

## Instructions

### Repository invariants

- Work happens at the **solution level**: this root `AGENTS.md` is the only guidance guaranteed to be loaded. Reach everything else through the routing below — read a nested file only when the current task walks to it, never up front.
- Every context (this root, or a working target like `web`/`db`/`jobs`) has the **same shape**: an `AGENTS.md`, a `docs/agents/` reference library (its `domain.md` glossary + conventions), and a `docs/adr/` decision log. The full convention is [`docs/agents/doc-architecture.md`](docs/agents/doc-architecture.md).
- The two standing rules below apply **at every level** — root and every working target alike.

### Read before you name (every level)

Before writing anything that names a domain concept — an issue title, a test name, a proposal, a hypothesis, a commit message, ADR wording — read the `domain.md` for the context you are working in, plus the root `domain.md` for solution-wide terms. Use its exact terms; avoid the synonyms it lists under _Avoid_. If a concept you need is not defined, that is a signal: either you are inventing language the project does not use (reconsider), or there is a real gap (note it for domain-modelling — do not silently coin a term). Skip only for tasks that produce no domain-named output (e.g. a dependency bump).

### Read before you decide or diverge (every level)

Before proposing an architectural change, or working in an area governed by a decision, scan the `docs/adr/` filenames for the context (they are titled) and read only the ones touching your area — the root `docs/adr/` for system-wide decisions, the target's for its internal ones. If your output would contradict an ADR, surface it explicitly ("Contradicts ADR-0004 (signals are deterministic-only) — but worth reopening because…") rather than silently overriding it.

## Routing — read only what the task needs, when it needs it

### Working targets

- Working on the web app or any UI change → `web/AGENTS.md`
- Working on the store of record — the schema, the Normalised Session Model, or a migration → `db/AGENTS.md`
- Working on a job — extraction, analysis, or the insight layer → `jobs/AGENTS.md`

### This (solution) context

- Solution-wide vocabulary → `docs/agents/domain.md`
- System-wide decisions → `docs/adr/`
- Planning an implementation (not the implement phase) → `docs/agents/planning.md`
- Issue tracker (issues & PRDs are GitHub Issues) → `docs/agents/issue-tracker.md`
- Triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) → `docs/agents/triage-labels.md`
- How this documentation is organised → `docs/agents/doc-architecture.md`

## Final review loop

Before declaring work complete, perform and report these steps in order:

1. **Re-read:** Compare the original request with the completed changes.
2. **Critique:** Check correctness, completeness, stale assumptions, unintended changes, and policy violations.
3. **Rectify:** Resolve every issue found during critique.
4. **Verify:** Run the narrowest meaningful tests, linters, or compiler checks for the final state.
5. **Report:** Summarise what changed, what was verified and how, and anything that remains unverified.

## Git Commit Protocol

If the changes successfully pass verification and are inside a repository, automatically stage and commit them.

- **Standard:** Follow the Conventional Commits v1.0.0 specification exactly.
- **Language:** Use UK/GB English spelling throughout.
- **Output:** Generate the raw commit message only — do not wrap it in markdown code blocks, and do not include any introductory or trailing commentary.
