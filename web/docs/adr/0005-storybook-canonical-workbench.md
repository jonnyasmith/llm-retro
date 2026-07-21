# Storybook is the canonical UI workbench

**Status:** accepted — supersedes [ADR-0002](0002-prototypes-as-dev-only-sveltekit-routes.md); amended by [ADR-0006](0006-msw-mock-layer-and-mock-mode-application.md)

Storybook is the canonical workbench for foundations, shared and feature-owned components, templates,
and mocked prop-driven page states. The production SvelteKit application is not a prototype host.

Stories capture meaningful variants, responsive states, loading, empty, error, dense, selected, disabled,
and other relevant states. Typed stories, useful Autodocs, curated MDX where generated documentation is
insufficient, interaction tests, accessibility checks, representative viewports, and a static Storybook
build are part of the normal verification contract. Global tokens and application styles are loaded once
through Storybook preview configuration.

Storybook titles primarily expose composition. Separate tags expose `ownership-shared` or
`ownership-feature-<feature>` ownership and `experimental`, `stable`, or `deprecated` lifecycle.
Storybook is a documentation and test surface, not the source-code architecture or a substitute for import
rules, public exports, types, and tests.

## SvelteKit scenario exception

A thin sibling SvelteKit scenario application is permitted only for an experiment that requires genuine
SvelteKit runtime behaviour that Storybook cannot represent: routing, loaders, SSR, form actions, hooks,
layout inheritance, server modules, or navigation. No current scenario justifies creating that application.

If evidence later requires it, each scenario must record why a story is insufficient and its promotion or
deletion criterion. The application must use controlled data and the same public design-system and feature
contracts, have its own smoke test, and must not become a second component catalogue.

The production application remains the final integration surface, with end-to-end or browser smoke tests
for real route behaviour.

## Prototype retirement

Existing `/prototype` states are classified before removal:

- pure components, templates, and mocked page states move to Storybook;
- validated UI moves into the appropriate shared or feature-owned layer;
- only genuine SvelteKit runtime scenarios could move to a sibling scenario application;
- obsolete or duplicate states are removed with evidence.

After equivalent coverage exists, the production `/prototype` routes, guards, banner, index, variant
framework, `$lib/components/prototypes`, and `$lib/prototype` namespaces are removed. Useful fixtures are
retained with the story or feature that owns them. A state is not discarded merely because its former
harness is retired.

## Consequences

- `pnpm storybook`, `pnpm storybook:test`, and `pnpm storybook:build` are supported contributor commands
  and Storybook verification is part of `pnpm verify`.
- Storybook's client-rendered static environment cannot prove SSR, loaders, server integration, or genuine
  navigation; those remain production-application concerns.
- Storybook is a maintained toolchain dependency and must be kept compatible with SvelteKit, Vite, Vitest,
  TypeScript, Node, and pnpm.
- No hosted visual service or external account is adopted. Any visual-regression service is a separate
  decision requiring explicit approval; this decision still requires render tests and visual inspection.
- Storybook AI manifests and MCP support are not part of the architecture. Agent legibility comes from
  stories, types, exports, documentation, import rules, and verification failures.
