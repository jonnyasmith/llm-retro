# Prototypes are full-fidelity, dev-only planning mockups under `/prototype`

**Status:** superseded by [ADR-0005](0005-storybook-canonical-workbench.md) (historical decision retained below)

A prototype is a **full working version of the real app driven by mock data** — real Svelte components, real routes, real tokens and primitives, but no database, jobs, or loaders wired up. It is a **planning-phase** artefact: the place we tweak components and pages to reach consensus on how the UI/UX should work, fast, before committing to implementation. Prototypes are built as real SvelteKit routes under `src/routes/prototype/<name>/`, served at `/prototype/<name>`. The whole `/prototype` subtree is **dev-only** (a `hooks.server.ts` handle hard-404s it unless `dev`) and **client-only** (`ssr = false` in `prototype/+layout.ts`), unlinked from the real app.

A prototype is **not throwaway junk** — it is real, composable app code — but it **is temporary**: once a design is agreed the prototype is **resolved**, either **deleted** (design rejected) or **promoted** (validated presentational components move into `$lib/components`, pages become real routes wired to real data). `/prototype` is not a standing gallery; there are no separate per-component example pages. The prototype app _is_ the harness — you see components in their real context.

## Considered Options

- **Standalone HTML files in `docs/prototypes/`** (the prior habit — e.g. `metrics-viewer.html`, since ported). Rejected: raw HTML/JS shares nothing with the SvelteKit app, so a validated design has to be rebuilt from scratch to ship, and it can't exercise real components, tokens, or routing conventions.
- **A route group `src/routes/(prototype)/`.** Rejected: route groups are erased from the URL, so they can't give the intended `/prototype/<name>` paths; and the shared throwaway layout wants a real, obvious prefix.
- **Ship `/prototype` in production behind a flag/auth.** Rejected: prototypes run on mock data with no error handling, no tests, no polish; keeping them out of the production build entirely is simpler and removes any risk of half-baked UI leaking to users.
- **A standing Storybook-style component catalogue.** Rejected: a separate gallery of isolated examples duplicates the app it mirrors and drifts from real usage. A full-fidelity mock app shows every component in its real context for free; the planning value comes from the whole screen, not isolated swatches.
- **Treat prototypes as disposable scratch that never shares code.** Rejected (this is the framing this revision overturns): prototypes and the real app are both thin consumers of the same `$lib` building blocks, so consensus code should graduate by re-pointing, not by rewriting.

## Consequences

- Prototypes and real routes are both thin consumers of shared building blocks in `$lib`; **promoting** a prototype means moving its validated presentational components from `$lib/components/prototypes/` to `$lib/components/` and pointing a real route at them with real data — no HTML-to-Svelte rewrite, no restyle.
- Provisional presentational components under design live in `$lib/components/prototypes/`; the prototype route composes them against mock data. Containment relies on `/prototype` being dev-only and real routes never importing prototype code — not a build-time firewall.
- Real-app chrome must live in a route group (e.g. `(app)`) rather than the root layout, so `/prototype` stays clean as the app grows.
- Prototype-only dependencies (e.g. `echarts`) are `devDependencies`: present at build, pruned for the production runtime, and only ever pulled into the dev-only prototype chunk.
- The `/prototype/<name>` convention, mock-data placement, the reusable `VariantBar`, and the promote/delete lifecycle are documented for agents in `web/docs/agents/prototyping.md`. The component-layering rules a promoted component must satisfy are [ADR-0003](0003-container-presentational-component-split.md).
- `web/docs/agents/domain.md` stays a pure domain glossary; _Prototype_, _promote_, _presentational_, and _container_ are build-workflow/architecture vocabulary defined in the agent guides, not the glossary.
