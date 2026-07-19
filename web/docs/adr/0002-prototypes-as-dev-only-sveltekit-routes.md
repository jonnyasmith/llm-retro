# Prototypes live as dev-only routes under `/prototype`, not standalone HTML

**Status:** accepted

Throwaway UI prototypes are built as real SvelteKit routes under `src/routes/prototype/<name>/`, served at `/prototype/<name>`, instead of standalone HTML files dropped in `docs/`. The whole `/prototype` subtree is dev-only (a `hooks.server.ts` handle hard-404s it unless `dev`) and client-only (`ssr = false` in `prototype/+layout.ts`), unlinked from the real app. This makes prototyping a first-class activity inside the app rather than a parallel artifact that can never share code with production.

## Considered Options

- **Standalone HTML files in `docs/prototypes/`** (the prior habit — e.g. `metrics-viewer.html`, since ported). Rejected: a prototype written in raw HTML/JS shares nothing with the SvelteKit app, so a validated design has to be rebuilt from scratch to ship, and the prototype can't exercise real components, tokens, or routing conventions.
- **A route group `src/routes/(prototype)/`.** Rejected: route groups are erased from the URL, so they can't give the intended `/prototype/<name>` paths; and the shared throwaway layout wants a real, obvious prefix.
- **Ship `/prototype` in production behind a flag/auth.** Rejected: prototypes are throwaway (no error handling, no tests, no polish); keeping them out of the production build entirely is simpler and removes any risk of half-baked UI leaking to users.

## Consequences

- Prototypes and real routes are both thin consumers of shared building blocks in `$lib`; **graduating** a prototype means pointing a real route at the same `$lib` pieces, with no HTML-to-Svelte rewrite.
- Real-app chrome must live in a route group (e.g. `(app)`) rather than the root layout, so `/prototype` stays clean as the app grows.
- Prototype-only dependencies (e.g. `echarts`) are `devDependencies`: present at build, pruned for the production runtime, and only ever pulled into the dev-only prototype chunk.
- The `/prototype/whatever` convention, the reusable `VariantBar`, and the graduation workflow are documented for agents in `web/docs/agents/prototyping.md`; the global `prototype` skill's "obey the project's routing convention" clause resolves there.
- `web/docs/agents/domain.md` stays a pure domain glossary; _Prototype_ and _graduate_ are build-workflow vocabulary defined in `web/docs/agents/prototyping.md`, not the glossary.
