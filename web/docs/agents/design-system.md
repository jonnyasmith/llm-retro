# Design system

How to build and change web UI. The architecture has three independent axes: **composition**,
**ownership**, and **lifecycle** ([ADR-0004](../adr/0004-ui-architecture-independent-axes.md)). Storybook is
the canonical workbench ([ADR-0005](../adr/0005-storybook-canonical-workbench.md)). Scoped CSS, design
tokens, typed variants, and native semantics remain governed by
[ADR-0001](../adr/0001-design-system-scoped-css-tokens-variants.md).

## Classify on three axes

Every UI contribution answers three separate questions.

### Composition: what does it compose?

| Level           | Definition                                                                                                     | Typical examples                      |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Foundations** | Non-component design decisions: tokens, typography, colour roles, spacing, radii, elevation, motion, and reset | Token and typography documentation    |
| **Atoms**       | Irreducible controls or single-responsibility behavioural or layout components                                 | Button, Badge, Text                   |
| **Molecules**   | Small reusable compositions solving one local UI purpose                                                       | Card header, filter field group       |
| **Organisms**   | Substantial UI regions coordinating atoms or molecules                                                         | Viewer top bar, Session detail header |
| **Templates**   | Content-agnostic page structures and layout contracts                                                          | Master-detail shell                   |
| **Pages**       | Concrete, prop-driven feature views representing application states                                            | Metrics view, Insights view           |

The levels operate concurrently; they are not an implementation sequence. Classify by the component's
public responsibility, not its line count or number of DOM nodes.

A level may import its own level or a less-composed level. Imports otherwise point towards foundations:
templates may import templates, organisms, molecules, atoms, and foundations, while atoms may import only
atoms and foundations. Foundations import no component level.

### Ownership: who may know what?

| Owner                    | Lives in                                                               | May know                                                                   | Must not own                                                      |
| ------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Shared design system** | `$lib/design-system/{foundations,atoms,molecules,organisms,templates}` | Generic UI contracts                                                       | Feature, route, domain, or SvelteKit runtime modules              |
| **Feature UI**           | `$lib/features/<feature>/ui`                                           | Domain types and shared design-system APIs                                 | Loaders, navigation, application state, or effects                |
| **Route orchestration**  | `src/routes/**`                                                        | SvelteKit runtime, server data, navigation, application state, and effects | Cards, grids, component styling, or recurring visual compositions |

Feature UI is props-in and callbacks-out. A route should normally render a feature page and wire its data
and callbacks. Cross-feature imports are prohibited unless the dependency is promoted to an explicit
shared public contract.

Use public exports. Do not deep-import another ownership boundary's implementation files.
Load semantic tokens through the public `$lib/design-system/tokens.css` stylesheet entry point; do not
deep-import the foundations stylesheet.

### Lifecycle: how safe is it to consume?

| State            | Contract                                                                            |
| ---------------- | ----------------------------------------------------------------------------------- |
| **Experimental** | Available for active design work, explicitly tagged, with no stability promise      |
| **Stable**       | Documented, tested, accessible, and supported as part of the public UI contract     |
| **Deprecated**   | Temporarily retained with replacement guidance; new usage is prohibited             |
| **Retired**      | Source and stories removed after consumers and migration evidence show it is unused |

Lifecycle is metadata, not a source directory. Storybook uses exactly one lifecycle tag:
`experimental`, `stable`, or `deprecated`. Ownership separately uses `ownership-shared` or
`ownership-feature-<feature>`.

## Classification decision tree

1. Is it a token, reset, or other non-component design decision? Put it in shared foundations.
2. Is it domain-agnostic and reusable across features? Put it in the shared design system at the smallest
   composition level matching its public responsibility.
3. Does it use domain types or solve one feature's UI problem? Put it under that feature's `ui` boundary at
   the composition level actually used.
4. Does it own loaders, server data, navigation, application state, or effects? Keep that orchestration in
   the route and pass serialisable data and callbacks into a feature page.
5. Does it need genuine SvelteKit runtime behaviour to demonstrate? Follow the Storybook/scenario decision
   in [`prototyping.md`](prototyping.md); do not put a prototype inside the production application.

Do not create empty composition directories merely to complete the taxonomy.

## Styling and variants

Component-scoped CSS and named design tokens are the styling contract. Do not introduce Tailwind,
CSS-in-JS, shared BEM component stylesheets, or duplicated design values that an existing token names.

Styled components follow the established variant contract where applicable:

1. Typed variant and size props resolve to `data-*` attributes on the root element.
2. Scoped CSS targets those attributes.
3. The `class` prop is safely merged after the base class.
4. Rest props safely forward native, `data-*`, `aria-*`, and event attributes supported by the root.

Use Svelte 5 typed props, snippets, and callback props. Do not introduce React composition conventions.

## Layout and markup

Use semantic HTML whenever content has meaningful structure. A raw `<div>` is correct for a genuinely
semantics-neutral internal grouping. Do not introduce meaningless wrapper components merely to remove
`<div>`.

Use a shared Stack, Row, Cluster, Grid, Container, Split, or similar component when its documented layout
algorithm matches the requirement. Repeated layout algorithms belong in the shared design system. A
feature-specific arrangement belongs in a feature organism, template, or page. A one-off internal layout
may use token-driven scoped CSS in its owning component when extraction would not improve reuse or clarity.

Route files do not own recurring visual layout. A narrow exception must explain why no existing shared
algorithm or feature-owned composition fits and identify the permitted replacement when the exception can
be removed.

Interactive markup belongs in the atom or feature component that owns its behaviour and accessibility.
Prefer native semantics. Use an existing public control when it represents the required behaviour; do not
simulate controls with `<a href="#">`, `<span onclick>`, or `<div onclick>`. Feature-owned raw interactive
markup requires a narrow documented `raw-interactive` architecture exception when no shared control fits.

## Storybook contribution contract

Colocate stories with the component, template, or page they exercise. Use typed `.stories.ts` files for
ordinary prop-driven UI; use `.stories.svelte` only when Svelte snippets or composed markup make the story
materially clearer.

Story titles use the composition hierarchy: `Foundations`, `Atoms`, `Molecules`, `Organisms`, `Templates`,
or `Pages`. Ownership and lifecycle remain metadata rather than extra folder hierarchies.

- A stable public component has a story, useful usage guidance, component tests, and accessibility coverage.
- Stories capture meaningful variants and loading, empty, error, selected, disabled, responsive, or dense
  states where those states exist.
- Prefer Autodocs for ordinary component APIs and curated MDX for foundations or architectural guidance.
- Load global tokens and application styles once through Storybook preview configuration.
- Do not depend on Storybook AI manifests, MCP support, Chromatic, or another hosted service.

Storybook is not a SvelteKit integration test. Loaders, navigation, and layout inheritance are exercised in
the mock-mode application (`pnpm dev:mock`, see [`prototyping.md`](prototyping.md)); SSR, form actions,
server modules, and hooks are verified in the production application.

## Adding or changing UI

- **New shared UI:** classify its composition level, keep it domain- and runtime-agnostic, expose it through
  the curated public API, assign lifecycle and ownership metadata, and add the required story and tests.
- **New feature UI:** keep it under one feature, consume shared public exports, remain props-in and
  callbacks-out, and add stories for meaningful states.
- **New variant:** widen the typed prop and add the corresponding `data-*` scoped-CSS branch.
- **New foundation:** add it under shared foundations with a semantic name and document it in Storybook.
- **Deprecation:** provide replacement guidance and mechanically prohibit new imports before removal.

## Verification

Run from `web/`:

- `pnpm verify` — formatting, ESLint and architecture checks, Svelte type/accessibility checks, unit and
  Storybook tests, and the static Storybook build.
- `pnpm architecture:check` — focused dependency direction, ownership, public import, route, story metadata,
  and obsolete-path checks.
- `pnpm build` — production SvelteKit build when UI or route integration changes.
- `pnpm storybook` — visually inspect representative states and responsive behaviour.
- `pnpm storybook:test` — interaction and automated accessibility checks.
- `pnpm storybook:build` — static workbench build.

Architecture failures must name the allowed dependency or replacement. Exceptions must be narrow,
documented, and tested; they must not encourage wrapper-heavy markup.
