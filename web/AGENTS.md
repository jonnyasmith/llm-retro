# Web — Agent Guide

The SvelteKit application: the control plane and the Viewers. The root [`../AGENTS.md`](../AGENTS.md) applies here too — including its _read before you name_ and _read before you decide_ standing rules.

## Instructions

### Verify after changes

Run from `web/`:

- **`pnpm verify`** — the gate: `prettier --check` + `eslint`, then `svelte-check --fail-on-warnings` (a11y/type warnings fail), then unit tests. Must pass before yielding web work.
- **`pnpm build`** — production build; run when a change could affect the bundle or SSR/adapter output.
- **`pnpm dev`** — dev server. Prototypes are dev-only, client-only under `/prototype`; smoke-test UI changes there or in the real routes.

Use `pnpm format` to apply Prettier.

### Design system

All UI composes the `$lib/ui` primitive kit (typed variants, design tokens, scoped CSS); no raw interactive elements. Read `docs/agents/design-system.md` before building or changing UI.

## Routing — read only what the task needs, when it needs it

- Vocabulary → `docs/agents/domain.md` (solution-wide terms → `../docs/agents/domain.md`)
- Decisions → `docs/adr/`
- Design system → `docs/agents/design-system.md`
- Prototyping — throwaway, dev-only design experiments under `/prototype` → `docs/agents/prototyping.md`
