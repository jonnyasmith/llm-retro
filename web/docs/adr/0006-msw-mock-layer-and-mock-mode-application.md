# Prototyping uses one MSW mock layer and a mock-mode application

**Status:** accepted — amends [ADR-0005](0005-storybook-canonical-workbench.md)

Prototyping happens **inside this repository** on real components, routes, and contracts, so a validated
prototype ships without a rewrite. A single [Mock Service Worker (MSW)](https://mswjs.io) layer supplies
mock network responses to every prototyping and test surface. Prototyping runs on **two surfaces**, chosen
by what is being exercised:

- **Storybook** — the workbench for foundations, shared and feature-owned components, templates, and
  prop-driven page states, exactly as [ADR-0005](0005-storybook-canonical-workbench.md) establishes.
- **The mock-mode application** — the real SvelteKit application run against MSW-mocked network responses
  with no database and no jobs, for full-fidelity routed prototypes: real routes, real loaders, real
  feature pages, driven by mock data.

_Mock mode_ is build-workflow vocabulary (like _prototype_, _promote_, and _presentational_): the real
application configured to answer its own `/api/*` calls from MSW handlers instead of a live backend. It is
not a domain term and does not enter `docs/agents/domain.md`.

## One mock layer

- Handlers are the single source of truth for mock network behaviour, co-located with the feature that owns
  the endpoints they mock. They are composed into one global handler set.
- Each handler describes a **happy path** by default. Individual stories, mock-mode scenarios, or tests add
  **runtime overrides** (for example a forced error or latency) and reset them between cases, following the
  MSW convention.
- The **browser worker** serves Storybook and the mock-mode application; the **Node server** serves Vitest.
  Both consume the same handler set, so one mock definition backs development, stories, and tests.
- Mock data grows with the real API surface: a handler exists only for an endpoint the application actually
  calls, and mocks a contract the real endpoint honours.

## Ownership is unchanged

[ADR-0004](0004-ui-architecture-independent-axes.md) stands in full. Feature pages remain **props-in and
callbacks-out** with no loaders, navigation, or effects; **routes own** loaders, server data, and
navigation. MSW intercepts at the **network boundary the loaders already use**, so nothing about ownership
moves into the feature layer. Feature components are not made to fetch their own data — that would contradict
ADR-0004 and, because SvelteKit's data home is the route loader, would turn promotion into a reverse rewrite.

Where a story exercises a component that genuinely reads SvelteKit runtime modules (`$app/navigation`,
`$app/stores`, `$app/state`) or makes a client-side request, Storybook mocks those modules and MSW answers
the request; the component under test is unmodified.

## What this replaces and retires

- **Revives the goal of [ADR-0002](0002-prototypes-as-dev-only-sveltekit-routes.md)** — a full working
  version of the real app driven by mock data — **without its mechanism.** There are no `/prototype` routes,
  guards, layouts, banner, index, variant framework, `$lib/components/prototypes`, or `$lib/prototype`. The
  mock-mode application is the real application with its network mocked, not a parallel prototype subtree.
- **Retires the sibling scenario application** permitted by [ADR-0005](0005-storybook-canonical-workbench.md).
  The runtime behaviour that clause reserved for a sibling app — routing, loaders, navigation, layout
  inheritance — is exactly what the mock-mode application exercises on the real routes. No sibling scenario
  application is created.

## What we are not adopting

Consistent with [ADR-0005](0005-storybook-canonical-workbench.md): **no hosted visual-regression service,
no Chromatic, and no external account.** Prototypes are reviewed by running Storybook and the mock-mode
application locally. Sharing a prototype means running it, not publishing it.

## Consequences

- MSW is a maintained toolchain dependency and must stay compatible with SvelteKit, Vite, Vitest, Storybook,
  TypeScript, Node, and pnpm. The generated service worker is a committed static asset.
- The verification gate gains MSW-backed coverage; Storybook interaction tests and Vitest reuse the shared
  handlers. A `dev:mock` command runs the mock-mode application.
- A project-scoped Claude skill encodes the prototyping conventions — the three axes from ADR-0004, the
  design-system public API, story metadata and tags, and handler placement — so generated stories, handlers,
  and mock-mode scenarios conform and pass `pnpm verify` without cleanup.
- `docs/agents/prototyping.md` and `web/AGENTS.md` are updated to describe the two surfaces, the mock layer,
  and the story-or-mock-mode decision, superseding the story-or-scenario framing.
- The mock-mode application proves routing, loaders, and navigation that Storybook cannot; the production
  application remains the final integration surface with end-to-end or browser smoke tests over live data.
