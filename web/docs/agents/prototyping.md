# UI experimentation and runtime scenarios

How to exercise UI ideas without creating a second architecture. Storybook is the canonical workbench;
the historical filename is retained so existing contributor links continue to resolve. Rationale is in
[ADR-0005](../adr/0005-storybook-canonical-workbench.md), and component placement follows
[ADR-0004](../adr/0004-ui-architecture-independent-axes.md).

## Use Storybook by default

A pure component, template, or mocked prop-driven page state belongs in Storybook. This includes visual
variants, responsive states, loading, empty, error, dense, selected, disabled, and alternative data states.

Keep fixtures beside the story or feature that owns them. An experimental component remains in its normal
composition and ownership location and carries the `experimental` lifecycle tag; experimentation is not a
source folder.

The production SvelteKit application must not contain `/prototype` routes, prototype guards or layouts, a
prototype banner or index, a variant framework, `$lib/components/prototypes`, or `$lib/prototype`.

## Story-or-scenario decision

1. Can props, callbacks, snippets, and controlled fixtures express the state? Use a Storybook story.
2. Does the experiment require real routing, loaders, SSR, form actions, hooks, layout inheritance, server
   modules, or navigation? It may qualify for a sibling SvelteKit scenario application.
3. Is it production integration behaviour rather than an experiment? Exercise it in the real application
   and its end-to-end or browser smoke tests.

Do not move a state to a scenario merely because Storybook configuration is unfamiliar. First extract pure
UI from route orchestration and story the prop-driven result.

## Scenario exception

No current scenario justifies creating a sibling scenario application. Do not create an empty application
for architectural symmetry.

If later evidence establishes a qualifying runtime scenario, propose the sibling application as a focused
change. Every scenario must record:

- the SvelteKit runtime behaviour that Storybook cannot represent;
- its controlled or mock data;
- the public design-system and feature contracts it consumes;
- its smoke-test command;
- its promotion or deletion criterion.

The sibling application lives outside the production SvelteKit application, contains no duplicate
component catalogue, and does not redefine UI components or fixtures already owned by Storybook.

## Lifecycle of an experiment

- **Start:** add an `experimental` story at the correct composition and ownership location.
- **Stabilise:** add documentation, tests, accessibility coverage, and the `stable` tag when the public
  contract is supported.
- **Deprecate:** tag it `deprecated`, document the replacement, and prohibit new imports.
- **Retire:** migrate consumers and remove the source and story.

When removing an old prototype harness, account for every state as migrated to Storybook, promoted into
stable UI, removed as obsolete or duplicate with evidence, or moved to a qualifying runtime scenario. Do
not lose a validated state merely because its former harness is removed.

## Commands

Run from `web/`:

- `pnpm storybook` — develop and visually inspect UI states.
- `pnpm storybook:test` — run interaction and accessibility checks.
- `pnpm storybook:build` — prove the workbench builds statically.
- `pnpm architecture:check` — validate lifecycle, ownership, imports, routes, and retired prototype paths.
- `pnpm build` — prove production route integration when relevant.
- `pnpm verify` — run the complete repository gate.

No hosted visual service or external account is part of this workflow.
