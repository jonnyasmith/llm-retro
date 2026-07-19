# Prototyping

How to build a UI prototype in this repo. This is the project's routing convention that the global
`prototype` skill defers to ("obey whatever routing convention the project already uses"). Rationale
and rejected alternatives: [ADR-0002](../adr/0002-prototypes-as-dev-only-sveltekit-routes.md). The
component layers a prototype builds against: [ADR-0003](../adr/0003-container-presentational-component-split.md).

## Vocabulary

- **Prototype** — a full working version of the real app driven by **mock data** (no DB, jobs, or
  loaders). Dev-only, never ships. It's a **planning-phase** artefact: the place we tweak components
  and pages to reach consensus on the UI/UX, fast. Real app code, not a throwaway hack — but
  temporary: once a design is agreed the prototype is **resolved**.
- **Provisional component** — a presentational component still under design, living in
  `$lib/components/prototypes/`. Composed by prototype routes against mock data.
- **Promote** — to fold a validated prototype into the real app: move its provisional presentational
  components from `$lib/components/prototypes/` to `$lib/components/`, and point a real route at them
  wired to real data. No HTML-to-Svelte rewrite and no restyle, because the prototype already _is_
  Svelte built from the same layers.
- **Resolve** — end a prototype's life once its design question is answered: **promote** it, or
  **delete** it (route folder + any provisional components only it used).

(These are build-workflow terms and deliberately stay out of `domain.md`, which is a pure domain
glossary.)

## The convention

- A prototype is a real SvelteKit route at `web/src/routes/prototype/<name>/+page.svelte`, reachable at `/prototype/<name>`. Use kebab-case names.
- The whole `/prototype` subtree is **dev-only** and **client-only**, enforced once (don't re-guard per prototype): a `hooks.server.ts` handle hard-404s any `/prototype` path unless `dev` (before rendering, so both the document and its data requests are gated), and `prototype/+layout.ts` sets `export const ssr = false;` so prototype UI never has to be SSR-safe. This dev-only route is what keeps prototypes out of production.
- `/prototype` itself is an **auto-generated index** (`import.meta.glob` over the nested `+page.svelte` files) — no manual registry. Prototypes are **unlinked** from the real app; you reach them by URL.
- The prototype layout (`prototype/+layout.svelte`) resets any main-app chrome, shows a `PROTOTYPE` banner, and renders the shared `VariantBar`. Keep it thin.

## Build against the real layers

A prototype is built from the same three layers as the real app ([ADR-0003](../adr/0003-container-presentational-component-split.md)): domain-agnostic primitives (`$lib/ui`), presentational components, and containers (the prototype routes). The only difference from production is the **data source** — mock data instead of loaders/DB.

- Presentational components under design are **provisional**: they live in `$lib/components/prototypes/`, are pure (props in, callbacks out), and own their whole appearance. The prototype route supplies mock data and callbacks. Do **not** hand-roll bespoke card/panel CSS in a prototype route — extract a provisional component, same as production.
- Mock data and genuinely prototype-only container glue live in the prototype's own route folder.
- On **promotion**, provisional components move `$lib/components/prototypes/` → `$lib/components/` and a real route (in the `(app)` group) wires them to real data. On **deletion**, remove the route folder and any provisional components only it used.
- Keep real-app chrome in an `(app)` route group rather than the root layout, so `/prototype` stays clean as the app grows.
- Prototype-only dependencies go in `devDependencies` (present at build, pruned from the production runtime, only ever bundled into the dev-only prototype chunk).

## Comparing variants

When a prototype needs to compare radically different looks of the same screen, use the shared `VariantBar` (`$lib/prototype/VariantBar.svelte`) instead of hand-rolling a switcher:

- In the prototype (or a child component), call `useVariants()` and register your variants in an `$effect`: `vb.set([{ id, label, description }, ...])`, returning `() => vb.clear()` on teardown.
- Read the active variant with `vb.current`; switch with `vb.select(id)`. The choice is reflected into the `?variant=` query param and rendered as a floating bottom bar by the layout. A screen that registers no variants shows no bar.

## Capturing the outcome

Follow the global `prototype` skill for the lifecycle, then **resolve** the prototype: **promote** the validated design into the real app (components to `$lib/components`, page to an `(app)` route wired to real data), or **delete** it. Either way, capture the design question and its verdict as a primary source (a pointer on the issue). The main branch keeps only resolved prototypes — nothing left in limbo.
