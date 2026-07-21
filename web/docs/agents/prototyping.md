# UI prototyping and runtime scenarios

How to exercise UI ideas in-codebase without a second architecture, so a validated prototype ships by
re-pointing rather than rewriting. Rationale is in [ADR-0005](../adr/0005-storybook-canonical-workbench.md)
and [ADR-0006](../adr/0006-msw-mock-layer-and-mock-mode-application.md); component placement follows
[ADR-0004](../adr/0004-ui-architecture-independent-axes.md). The step-by-step authoring procedure is the
`web-prototype` Claude skill.

## Two surfaces

Prototyping runs on two surfaces, chosen by what is being exercised:

- **Storybook** — the workbench for foundations, shared and feature-owned components, templates, and
  prop-driven page states: visual variants, responsive, loading, empty, error, dense, selected, disabled,
  and alternative data states. This is the default.
- **The mock-mode application** (`pnpm dev:mock`) — the real SvelteKit application run against the MSW mock
  network with no database, for full-fidelity routed prototypes: real routes, real loaders, real feature
  pages, driven by mock data. It renders client-side so the browser worker can intercept `/api/*` calls.

Mock mode is activated by the `PUBLIC_MOCK_API` environment variable, which `pnpm dev:mock` sets. Because
the promise is a _database-free_ run, server code that would reach the database or another backend at
startup — for example the migration step in `hooks.server.ts` — must no-op when that variable is set. Client
requests are answered by MSW; the server never touches the backend.

Keep fixtures beside the story or feature that owns them. An experimental component stays in its normal
composition and ownership location and carries the `experimental` lifecycle tag; experimentation is not a
source folder. The production SvelteKit application must not contain `/prototype` routes, prototype guards
or layouts, a prototype banner or index, a variant framework, `$lib/components/prototypes`, or
`$lib/prototype`.

## Story-or-mock-mode decision

1. Can props, callbacks, snippets, and controlled fixtures express the state? Use a **Storybook story**.
2. Does the experiment require real routing, loaders, navigation, or layout inheritance? Run it in the
   **mock-mode application** on the real routes.
3. Is it production integration behaviour rather than an experiment? Exercise it in the real application
   against live data and its end-to-end or browser smoke tests.

Do not move a state to the mock-mode application merely because Storybook is unfamiliar. First extract pure
UI from route orchestration and story the prop-driven result.

## One MSW mock layer

A single [MSW](https://mswjs.io) handler set backs Storybook, the mock-mode application, and Vitest.

- Each feature owns its handlers in `src/lib/features/<feature>/mocks/handlers.ts`: a happy-path array plus
  named runtime overrides for failure states. Re-export both from the feature `index.ts`.
- Feature handlers compose into `src/lib/mocks/handlers.ts` (`handlers`) — the single source of truth.
- The browser worker (`src/lib/mocks/browser.ts`) serves Storybook and mock mode; the Node server
  (`src/lib/mocks/node.ts`) serves Vitest. The generated worker script is `static/mockServiceWorker.js`.
- Match paths host-agnostically (`*/api/...`) so one handler works for the browser's relative calls and
  Node's absolute test URLs.
- Override a state for one case: a story via `parameters.msw`, a test via `server.use(...)`, reset between
  cases. A handler exists only for an endpoint the application actually calls and honours the real contract.

The control-plane slice is the end-to-end reference: `features/control-plane/mocks/handlers.ts`, the
`/api/health` loader in `src/routes/+page.ts`, `ControlPlanePage` and its story, and
`src/lib/mocks/handlers.test.ts`.

## Lifecycle of an experiment

- **Start:** add an `experimental` story at the correct composition and ownership location.
- **Stabilise:** add documentation, tests, accessibility coverage, and the `stable` tag when the public
  contract is supported.
- **Deprecate:** tag it `deprecated`, document the replacement, and prohibit new imports.
- **Retire:** migrate consumers and remove the source and story.

Promoting a routed prototype means pointing real data at loaders that already exist and removing the mock
handlers it relied on — the components do not change.

## Commands

Run from `web/`:

- `pnpm storybook` — develop and visually inspect prop-driven UI states.
- `pnpm dev:mock` — run the mock-mode application for routed, loader-driven prototypes.
- `pnpm storybook:test` — run interaction and accessibility checks.
- `pnpm storybook:build` — prove the workbench builds statically.
- `pnpm architecture:check` — validate lifecycle, ownership, imports, routes, and retired prototype paths.
- `pnpm build` — prove production route integration when relevant.
- `pnpm verify` — run the complete repository gate.

No hosted visual service or external account is part of this workflow; review by running the two surfaces
locally.
