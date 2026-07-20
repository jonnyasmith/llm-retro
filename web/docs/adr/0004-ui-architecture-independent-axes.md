# UI architecture uses independent composition, ownership, and lifecycle axes

**Status:** accepted — supersedes [ADR-0003](0003-container-presentational-component-split.md)

UI is classified on three independent axes. No folder name or label may stand in for more than one axis.

## Composition

The composition scale is **foundations → atoms → molecules → organisms → templates → pages**.

- Foundations are tokens, typography, colour roles, spacing, radii, elevation, motion, and the global reset.
- Atoms are irreducible controls or single-responsibility behavioural or layout components.
- Molecules are small reusable compositions that solve one local UI purpose.
- Organisms are substantial regions coordinating atoms and molecules.
- Templates are content-agnostic page structures and layout contracts.
- Pages are concrete, prop-driven feature views representing application states.

The shared design system lives under
`$lib/design-system/{foundations,atoms,molecules,organisms,templates}`. Feature UI uses only the
composition directories it needs under `$lib/features/<feature>/ui`; empty taxonomy directories are not
created. SvelteKit route files are orchestration adapters, not Atomic Design pages.

Within either ownership boundary, a composition level may import its own level or a less-composed level.
Imports in the opposite direction are prohibited. Foundations import no component level.

## Ownership

- The shared design system is domain-agnostic and SvelteKit-runtime-agnostic. It exposes a curated public
  API and must not import feature, route, domain, or `$app/*` modules.
- Feature UI may use domain types and the shared design system. It remains props-in and callbacks-out,
  with no loaders, navigation, application state, or effects. Cross-feature imports are prohibited unless
  the dependency is promoted to an explicit shared public contract.
- Route orchestration owns loaders, server data, navigation, application state, and effects. A route
  normally renders a feature page and wires runtime behaviour into it; it does not invent cards, grids,
  component styling, or recurring visual compositions.

Consumers import public exports instead of deep source paths.

## Lifecycle

Lifecycle is explicit metadata, independent of composition and ownership:

- **Experimental:** available for active design work, with no stability promise.
- **Stable:** documented, tested, accessible, and supported as part of the public UI contract.
- **Deprecated:** retained temporarily with replacement guidance; new imports are prohibited.
- **Retired:** removed after consumers and migration evidence show it is unused.

Storybook tags encode `experimental`, `stable`, or `deprecated`; retired UI has no source or story.
Ownership tags separately use `ownership-shared` or `ownership-feature-<feature>`.

Consumers import components from `$lib/design-system`. The one supported stylesheet entry point is
`$lib/design-system/tokens.css`; foundations remain internal implementation files.

## Layout and markup

Semantic HTML is preferred whenever content has meaningful structure. A raw `<div>` is valid for a
genuinely semantics-neutral internal grouping; contributors must not create wrapper components merely to
eliminate `<div>`.

Recurring Stack, Row, Cluster, Grid, Container, Split, or similar algorithms belong in the shared design
system. Feature-specific arrangements belong in feature organisms, templates, or pages. A one-off internal
layout may use token-driven scoped CSS in its owning component when extracting a reusable algorithm would
not improve clarity. Narrow documented exceptions are permitted; route-owned recurring visual layout is
not.

Interactive markup belongs to the component that owns its behaviour and accessibility. Consumers use an
existing public control when one represents the required behaviour.

## Consequences

- Import boundaries, public exports, lifecycle metadata, deprecated usage, stable story coverage, and
  obsolete prototype paths are mechanically checked with actionable exceptions.
- Stable public components require typed stories, usage guidance, tests, and accessibility coverage.
- Composition classification requires judgement, but dependency direction and ownership do not.
- [ADR-0001](0001-design-system-scoped-css-tokens-variants.md) remains in force: scoped CSS, tokens, typed
  variants, `data-*` surfaces, native semantics, safe class/rest forwarding, and no Tailwind or CSS-in-JS.
