# Prototyping

How to build a throwaway UI prototype in this repo. This is the project's routing convention that the global `prototype` skill defers to ("obey whatever routing convention the project already uses"). Rationale and rejected alternatives: [ADR-0002](../adr/0002-prototypes-as-dev-only-sveltekit-routes.md).

## Vocabulary

- **Prototype** — throwaway, dev-only code that answers a design question. It lives inside the SvelteKit app but never ships to production.
- **Graduate** — to fold a validated prototype into the real app by pointing a real route at the shared `$lib` building blocks the prototype used. No HTML-to-Svelte rewrite, because the prototype already _is_ Svelte.

(These are build-workflow terms and deliberately stay out of `domain.md`, which is a pure domain glossary.)

## The convention

- A prototype is a real SvelteKit route at `web/src/routes/prototype/<name>/+page.svelte`, reachable at `/prototype/<name>`. Use kebab-case names.
- The whole `/prototype` subtree is **dev-only** and **client-only**, enforced once (don't re-guard per prototype): a `hooks.server.ts` handle hard-404s any `/prototype` path unless `dev` (before rendering, so both the document and its data requests are gated), and `prototype/+layout.ts` sets `export const ssr = false;` so throwaway UI never has to be SSR-safe.
- `/prototype` itself is an **auto-generated index** (`import.meta.glob` over the nested `+page.svelte` files) — no manual registry. Prototypes are **unlinked** from the real app; you reach them by URL.
- The prototype layout (`prototype/+layout.svelte`) resets any main-app chrome, shows a `PROTOTYPE` banner, and renders the shared `VariantBar`. Keep it thin.

## Reuse and graduation

- Shared building blocks — components, design tokens, CSS — live in `$lib`. Both prototype routes and real routes import them. Do **not** duplicate UI primitives inside `prototype/`; put anything reusable in `$lib` so graduation is a one-line re-point, not a rewrite.
- Prototype-specific, genuinely throwaway code (mock data, one-off layouts) can live in the prototype's own route folder.
- Keep real-app chrome in an `(app)` route group rather than the root layout, so `/prototype` stays clean as the app grows.
- Prototype-only dependencies go in `devDependencies` (present at build, pruned from the production runtime, only ever bundled into the dev-only prototype chunk).

## Comparing variants

When a prototype needs to compare radically different looks of the same screen, use the shared `VariantBar` (`$lib/prototype/VariantBar.svelte`) instead of hand-rolling a switcher:

- In the prototype (or a child component), call `useVariants()` and register your variants in an `$effect`: `vb.set([{ id, label, description }, ...])`, returning `() => vb.clear()` on teardown.
- Read the active variant with `vb.current`; switch with `vb.select(id)`. The choice is reflected into the `?variant=` query param and rendered as a floating bottom bar by the layout. A screen that registers no variants shows no bar.

## Capturing the outcome

Follow the global `prototype` skill for the throwaway lifecycle: fold the validated decision into the real code (graduate it), then capture the prototype and its verdict as a primary source (a throwaway branch + a pointer on the issue). The main branch keeps only the validated decision.
