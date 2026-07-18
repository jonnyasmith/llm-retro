# Polyglot split: Python jobs, SvelteKit web app

**Status:** accepted

Because Jobs are isolated containers that communicate only via labels and Postgres, the job language is decoupled from the web-app language, and we use each ecosystem where it is strongest. **Jobs are Python** (a shared thin job-base image): data-wrangling now, and every deferred job type — ML, Jupyter/notebooks, embeddings/indexing — is Python-centric, so anything else would corner the future the architecture exists to protect. **The web app is SvelteKit** (full-stack TypeScript): its server routes hold both Postgres access and the Docker socket (via `dockerode`) for image discovery and one-shot launch, and its reactive frontend renders the two coordinated viewers. Postgres is the language-neutral contract between the two worlds.

## Considered Options

- **FastAPI + HTMX (one-language Python full-stack)** — rejected on lived experience: HTMX partial-wrangling was slow to get right across prior builds and weak for rich, coordinated, interactive views.
- **Python for jobs was near-forced**, not a real trade-off — recorded only because a future reader might otherwise "unify" on TypeScript and break the ML path.

## Consequences

- The SvelteKit Node server holds the Docker socket directly (fewest services), acceptable for a single-user, locally-run tool. A thin dispatcher service is the reserved hardening seam if the tool ever becomes multi-user or network-exposed — a localised extraction, since jobs are already isolated behind the label contract.

Decided in [#5](https://github.com/jonnyasmith/llm-retro/issues/5).
