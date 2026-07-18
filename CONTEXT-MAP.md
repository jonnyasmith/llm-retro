# Context Map

LLM Retro — retrospectively review your own AI-coding sessions (Claude, Codex, pi) to learn what works over time. A monorepo; each context owns its own language in its `CONTEXT.md`.

## Contexts

- [Web](./web/CONTEXT.md) — the control plane and Viewers (SvelteKit app + UI)
- [Jobs](./jobs/CONTEXT.md) — extraction and analysis Job containers
- [Database](./db/CONTEXT.md) — the Normalised Session Model schema and migrations

## Relationships

- **Jobs → Database**: extraction Jobs write the Normalised Session Model; analysis Jobs read it to derive Signals and Inferences.
- **Web → Database, Jobs**: the Viewers read Signals (Metrics view) and Inferences (Insights view); the control plane triggers Jobs.
- **Shared entities**: Session, Tool and Message originate in Database and are referenced by every context.
