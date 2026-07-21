---
name: web-prototype
description: Prototype a web UI state or flow in-codebase using Storybook stories, MSW mock handlers, and the mock-mode application, so the prototype ships without a rewrite. Use when building or iterating on UI in web/ — a component state, a mocked page state, or a routed flow — before wiring real data.
---

# Web prototyping (Storybook + MSW, in-codebase)

Prototypes live in this repository on the real design system, so a validated
prototype is promoted by re-pointing, not rewriting. Read `web/AGENTS.md`,
`web/docs/agents/design-system.md`, and `web/docs/agents/prototyping.md` first;
this skill is the authoring procedure, those are the contracts. The governing
decisions are ADR-0004 (independent axes) and ADR-0006 (MSW mock layer).

## Pick the surface

1. **A component or a prop-driven page state** (visual variants, loading, empty,
   error, dense, selected, disabled, responsive) → a **Storybook story**.
2. **A routed flow or loader-driven page** (navigation, nested layouts, real
   `load`) → run the **mock-mode application** (`pnpm dev:mock`): the real routes
   and loaders against MSW mock data, no database.

Do not reach for the mock-mode app just because a Storybook story is unfamiliar.
First extract the pure UI and story its prop-driven states; use mock mode only
for genuine SvelteKit runtime behaviour.

## Place the component (ADR-0004 axes)

- **Composition**: foundations → atoms → molecules → organisms → templates →
  pages. A level imports only its own or a less-composed level.
- **Ownership**: shared UI under `$lib/design-system/<level>`; feature UI under
  `$lib/features/<feature>/ui/<level>`. Feature pages are **props-in,
  callbacks-out** — no loaders, fetches, navigation, or effects. Routes own data.
- **Lifecycle**: new work starts `experimental`; stabilise to `stable`.

## Author the story

- Co-locate `Name.stories.ts` beside the component.
- Title exposes composition (e.g. `Pages/Control plane`, `Molecules/Card`).
- Tags: exactly **one** lifecycle (`experimental` | `stable` | `deprecated`)
  plus ownership (`ownership-shared` or `ownership-feature-<feature>`); add
  `autodocs`.
- Drive states through `args`; keep fixtures beside the story or feature.
- A public shared or feature component **must** have a colocated story with the
  correct tags, or `architecture:check` fails.

## Mock the network (MSW)

- One handler set per feature in `src/lib/features/<feature>/mocks/handlers.ts`,
  exporting a happy-path array plus named runtime overrides for failure states.
- Re-export both from the feature's `index.ts`; deep imports into a feature are
  prohibited, so everything routes through the public API.
- Compose feature handlers into `src/lib/mocks/handlers.ts` (`handlers`), the
  single source of truth reused by Storybook, `dev:mock`, and Vitest.
- Match paths host-agnostically (`*/api/...`) so one handler works in the
  browser (relative calls) and Node (absolute test URLs).
- A story exercises a failure state via `parameters.msw`; a Vitest test via
  `server.use(override)`, reset between cases.

See the control-plane slice for the end-to-end reference: `mocks/handlers.ts`,
the `/api/health` loader in `src/routes/+page.ts`, `ControlPlanePage`, its story,
and `src/lib/mocks/handlers.test.ts`.

## Verify before yielding

Run `pnpm verify` from `web/`. It must pass: format, ESLint, architecture
checks, Svelte type/a11y checks, unit tests, Storybook interaction/a11y tests,
and the static Storybook build. There is no hosted sharing — review by running
`pnpm storybook` and `pnpm dev:mock` locally.
