# Web — Agent Guide

The SvelteKit application: the control plane and the Viewers. The root [`../AGENTS.md`](../AGENTS.md) applies here too — including its _read before you name_ and _read before you decide_ standing rules.

## Instructions

### Verify after changes

Run from `web/`:

- **`pnpm verify`** — the gate: formatting and ESLint, UI architecture checks, Svelte type/accessibility checks, unit and Storybook tests, and the static Storybook build. Must pass before yielding web work.
- **`pnpm architecture:check`** — focused import, ownership, story metadata, route, and obsolete-path rules.
- **`pnpm build`** — production build; run when a change could affect the bundle or SSR/adapter output.
- **`pnpm storybook`** — canonical UI workbench for components, templates, and mocked page states.
- **`pnpm storybook:test`** — Storybook interaction and accessibility tests.
- **`pnpm storybook:build`** — static Storybook build; run for changes to UI, stories, or Storybook configuration.
- **`pnpm dev:mock`** — the real application against the MSW mock network with no database; use it for routed, loader-driven prototypes.
- **`pnpm dev`** — production-application development server; use it to smoke-test real route integration.

Use `pnpm format` to apply Prettier.

### Design system

UI follows three independent axes: composition, ownership, and lifecycle. Shared UI lives behind the
`$lib/design-system` public API, feature UI under `$lib/features/<feature>/ui`, and route files orchestrate
runtime behaviour. Prefer semantic HTML; use a neutral `<div>` when it is genuinely semantics-neutral.
Read `docs/agents/design-system.md` before building or changing UI.

## Routing — read only what the task needs, when it needs it

- Web-scoped vocabulary → `docs/agents/domain.md` (solution-wide terms → `../docs/agents/domain.md`)
- Web-scoped decisions → `docs/adr/`
- Design system → `docs/agents/design-system.md`
- UI experiments — Storybook for prop-driven states; the mock-mode app for routed, loader-driven flows → `docs/agents/prototyping.md`
