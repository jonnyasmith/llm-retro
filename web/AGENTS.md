# Web

The SvelteKit application: the control plane and Viewers. The root [`../AGENTS.md`](../AGENTS.md) also applies.

## Domain & decisions

- **Language:** [`CONTEXT.md`](CONTEXT.md) — web's inner domain; solution-wide terms in [`../CONTEXT.md`](../CONTEXT.md).
- **Decisions:** [`docs/adr/`](docs/adr/) — web-scoped ADRs.

## Verify after changes

Run from `web/`:

- **`pnpm verify`** — the gate: `prettier --check` + `eslint`, then `svelte-check --fail-on-warnings` (a11y/type warnings fail), then unit tests. Must pass before yielding web work.
- **`pnpm build`** — production build; run when a change could affect the bundle or SSR/adapter output.
- **`pnpm dev`** — dev server. Prototypes are dev-only, client-only under `/prototype`; smoke-test UI changes there or in the real routes.

Use `pnpm format` to apply Prettier.

## Conventions

- **Design system** — all UI composes the `$lib/ui` primitive kit (typed variants, design tokens, scoped CSS); no raw interactive elements. Read [`docs/agents/design-system.md`](docs/agents/design-system.md) before building or changing UI.
- **Prototyping** — throwaway, dev-only design experiments under `/prototype`. See [`docs/agents/prototyping.md`](docs/agents/prototyping.md).
