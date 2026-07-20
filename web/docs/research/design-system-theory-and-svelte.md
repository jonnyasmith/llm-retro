# Design-system theory, governance, and Svelte/SvelteKit

**Status:** research only — no architecture selected

**Date:** 20 July 2026

## Research question

What general frontend design-system theories and governance models could make this repository easier for
humans and coding agents to extend consistently, and how do Svelte/SvelteKit mechanics constrain those
options?

This report separates three things that are often conflated:

1. **Design-system theory** — how UI is classified and composed.
2. **Governance** — how components enter, change, mature, and leave the system.
3. **Framework mechanics** — how Svelte and SvelteKit implement the chosen model.

It deliberately does not choose a target architecture or prescribe repository changes.

## Executive findings

- There is no single accepted “component-based architecture.” The major theories classify UI on
  different axes: compositional scale, spatial responsibility, CSS responsibility, control anatomy,
  behavioural ownership, product specificity, or feature ownership.
- Atomic Design is a vocabulary for moving between abstract elements and concrete pages. Its author
  explicitly describes the stages as concurrent rather than a linear build process. It is not by itself
  a folder structure, styling system, state architecture, or import-boundary model.
- Layout theories such as Every Layout and CUBE CSS address the exact `Grid`-versus-local-CSS question
  more directly than Atomic Design. They still do not answer where domain components, state, or data
  belong.
- Large public systems such as Atlassian, GOV.UK, USWDS, and Material use more than one layer. Common
  distinctions are foundations/tokens, components, patterns, templates/pages, and explicit component
  lifecycle states.
- “Headless” and “styled” components are allocations of responsibility, not complete application
  architectures. A system can use headless behavioural primitives underneath styled product
  components while organising features separately.
- Svelte supports any of these taxonomies. Its relevant native strengths are semantic HTML,
  component-scoped CSS, typed props and snippets, custom properties, compile-time accessibility checks,
  and SvelteKit layouts/load/actions. Svelte does not recommend replacing every native element with a
  component.
- The current repository is a deliberate hybrid: token foundations, styled domain-agnostic UI,
  domain-aware pure presentation, and route-local containers. The recurring inconsistency comes from
  several unresolved cross-theory questions, not simply from agents ignoring a complete convention.
- For coding agents, prose alone is weak governance. Current Storybook guidance recommends focused
  examples, explicit “why” descriptions, structured component metadata, and curated context. Types,
  exports, examples, and precise verification feedback complement rather than replace architectural
  explanation.

## A design system has several independent axes

The theories below become easier to compare when treated as answers to different questions.

| Axis                        | Question                                                          | Example theories/systems                  |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| Composition scale           | How abstract or page-specific is this UI?                         | Atomic Design                             |
| Spatial responsibility      | Which reusable algorithm owns layout?                             | Every Layout                              |
| CSS responsibility          | Is this rule global composition, utility, block, or exception?    | CUBE CSS                                  |
| Control anatomy             | What are the semantic parts, states, and behaviours of a control? | Open UI                                   |
| Behaviour versus appearance | Who owns keyboard/focus/state, and who owns styling?              | Headless primitives versus styled systems |
| Design-decision indirection | How do raw values become semantic and component decisions?        | DTCG tokens, Material tokens              |
| User-task specificity       | Is this a foundation, component, pattern, template, or page?      | Atlassian, GOV.UK                         |
| Product/module ownership    | Which feature owns UI, state, data, and public exports?           | Vertical/feature-sliced architectures     |
| Confidence and support      | Is this proposed, experimental, stable, deprecated, or retired?   | USWDS lifecycle                           |

A repository can combine models across axes. The risk is using one overloaded word—particularly
“primitive” or “component”—for several different axes without saying which one is meant.

## Theory survey

### Atomic Design

Brad Frost’s model is **atoms → molecules → organisms → templates → pages**. Atoms are basic elements,
molecules are simple functional groups, organisms are relatively complex sections, templates arrange
content structure, and pages are concrete instances. The stages operate concurrently and form a mental
model rather than a mandated implementation sequence.

What it illuminates:

- movement between abstract building blocks and real pages;
- why a complete page cannot be understood only as a collection of tiny controls;
- a shared designer/developer vocabulary for composition depth.

What it leaves open:

- atoms-versus-molecules and molecules-versus-organisms involve judgement;
- it does not define CSS ownership, tokens, state, data access, accessibility machinery, feature
  boundaries, imports, or versioning;
- treating it as a rigid folder tree can turn a thinking tool into classification churn.

Sources: [Atomic Design methodology](https://atomicdesign.bradfrost.com/chapter-2/),
[book outline and challenges](https://atomicdesign.bradfrost.com/outline/).

### Every Layout

Every Layout describes a small algebra of meaning-neutral spatial primitives, including Stack, Box,
Cluster, Sidebar, Switcher, Grid, Frame, and Container. Each primitive owns a narrow layout algorithm;
semantic and product meaning emerge through composition. Its intrinsic approach lets browser layout
algorithms decide when a layout changes instead of multiplying viewport-specific rules.

What it illuminates:

- `Grid` is a stable spatial contract, not a synonym for every use of `display: grid`;
- layout primitives and semantic elements answer different questions;
- resilient layout APIs can reduce repeated breakpoint and spacing decisions.

What it leaves open:

- visual styling, control behaviour, state, data, and domain components;
- when a unique art-directed layout stays local;
- whether primitives are framework components, CSS classes, or another mechanism.

Sources: [Every Layout composition](https://every-layout.dev/rudiments/composition/),
[layout catalogue](https://every-layout.dev/layouts/),
[axioms and styling tiers](https://every-layout.dev/rudiments/axioms/).

### CUBE CSS

CUBE means **Composition, Utility, Block, Exception**:

- Composition owns component-agnostic layout and flow.
- Utilities perform one token-driven job.
- Blocks add component-specific context.
- Exceptions describe state or deviations, commonly through data attributes.

It is progressive and cascade-friendly: global styles and browser defaults do useful work before local
rules are added.

What it illuminates:

- layout and appearance are different CSS responsibilities;
- a component does not need to own every style that affects it;
- state/deviation can be explicit rather than encoded in ad-hoc selector complexity.

What it leaves open:

- component folders, feature ownership, state, data, and route boundaries;
- how global cascade tiers translate into a system built primarily with Svelte-scoped styles.

Sources: [CUBE overview](https://cube.fyi/), [Composition](https://cube.fyi/composition),
[Utility](https://cube.fyi/utility.html), [Block](https://cube.fyi/block.html),
[Exception](https://cube.fyi/exception.html), [progressive CSS](https://cube.fyi/css.html).

### Open UI

Open UI researches existing design systems to standardise control names, anatomy, states, behaviour,
accessibility, and ultimately native extensibility. Its working mode moves from research and design-
system analysis towards specifications and tests.

What it illuminates:

- a control is more than its visual wrapper: anatomy, semantics, states, keyboard behaviour, and
  accessibility form a contract;
- naming and anatomy can be compared across systems before inventing a local API;
- native platform evolution can remove some custom-component machinery over time.

What it leaves open:

- product architecture, tokens, folders, page composition, and domain UI;
- many items are research or draft work rather than stable implementation guidance.

Sources: [Open UI purpose](https://open-ui.org/),
[working mode](https://open-ui.org/working-mode/), [charter](https://open-ui.org/charter/),
[design-system analysis guide](https://open-ui.org/design-system-analysis-guide/).

### Headless behavioural primitives

Radix is a useful first-party example of the headless approach: low-level unstyled components own
accessibility, focus, keyboard behaviour, state, and granular anatomy while consumers own visual and
some functional styles.

What it illuminates:

- behavioural/accessibility machinery and product appearance can be independent layers;
- controlled/uncontrolled state, composable parts, and state data attributes can be public contracts;
- styled product components can wrap a headless behavioural base.

Typical trade-offs:

- headless systems preserve brand freedom but do not create visual consistency automatically;
- fine-grained parts can produce verbose trees;
- polymorphic composition can break semantics if consumers choose the wrong native element;
- wrappers must forward the required attributes and references correctly.

Radix is React-specific; it is evidence for an architectural allocation, not a Svelte dependency
recommendation.

Sources: [Radix introduction](https://www.radix-ui.com/primitives/docs/overview/introduction),
[accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility),
[composition](https://www.radix-ui.com/primitives/docs/guides/composition),
[styling responsibilities](https://www.radix-ui.com/primitives/docs/guides/styling).

### Material Design 3 and Material Web

Material uses token indirection and ships an opinionated styled component language. Reference tokens
hold concrete values, system tokens express semantic roles, and component tokens map component details
to those system decisions. Material Web delivers styled behaviour as custom elements.

What it illuminates:

- primitive, semantic/system, and component token layers serve different change scopes;
- a styled system can own both behavioural and visual coherence;
- theming is a declared mapping rather than scattered overrides.

Typical trade-offs:

- a comprehensive system accelerates delivery but carries a strong visual and behavioural worldview;
- extensive component-token overrides can erode coherence;
- custom-element boundaries introduce framework integration and theming considerations.

Sources: [Material Web introduction](https://material-web.dev/about/intro/),
[Material theming and token layers](https://material-web.dev/theming/material-theming/).

### Foundations → components → patterns → pages

Atlassian separates foundations, components, and patterns/experiences, and also exposes layout
primitives such as Box, Inline, and Stack. GOV.UK separates styles, reusable components, user-task
patterns, and a shared page template. Patterns may compose several components to solve a recognisable
user need.

What this family illuminates:

- a reusable user-task solution is different from both a low-level control and a route instance;
- layout primitives can coexist with styled controls and product patterns;
- content, accessibility, and usage guidance are part of the design system, not only code.

Typical trade-offs:

- component-versus-pattern boundaries still require judgement;
- generic Box/Stack APIs can create wrapper-heavy markup when applied mechanically;
- mature public systems include brand and organisational assumptions that may not transfer wholesale.

Sources: [Atlassian Design System](https://atlassian.design/design-system/),
[Atlassian goals and principles](https://atlassian.design/get-started/about-atlassian-design-system),
[GOV.UK Design System](https://design-system.service.gov.uk/),
[GOV.UK components](https://design-system.service.gov.uk/components/),
[GOV.UK patterns](https://design-system.service.gov.uk/patterns/),
[GOV.UK page template](https://design-system.service.gov.uk/styles/page-template/),
[extension guidance](https://design-system.service.gov.uk/get-started/extending-and-modifying-components/).

## Design tokens are a governance choice, not only a file format

The Design Tokens Community Group 2025.10 reports define named values, types, descriptions, groups,
aliases, and extensions for interchange between tools. The format is stable but is a W3C Community
Group report rather than a W3C Standard. It explicitly warns tools not to infer token purpose or type
from arbitrary group hierarchy.

Competing source strategies:

| Strategy                                                       | Strength                                                     | Cost                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| CSS custom properties as source                                | Native, simple, inspectable, supports runtime cascade/themes | Web-specific; less typed metadata and weaker interchange          |
| Platform-neutral token source generating CSS/TS/native outputs | Schema validation, aliases, cross-platform consistency       | Build tooling, generated-file policy, translation-layer debugging |
| Primitive tokens only                                          | Small and flexible                                           | Consumers repeatedly encode intent                                |
| Primitive + semantic + component tokens                        | Captures intent and supports themes/redesigns                | Larger naming and governance burden; possible over-abstraction    |

The DTCG format enables aliases but does not prescribe a primitive/semantic/component hierarchy.

Sources: [DTCG reports](https://www.designtokens.org/tr/2025.10/),
[format module](https://www.designtokens.org/tr/2025.10/format/),
[resolver module](https://www.designtokens.org/tr/2025.10/resolver/),
[colour module](https://www.designtokens.org/tr/2025.10/color/).

## Governance models

### Component lifecycle

USWDS publishes proposal, development, experimental, stable, use-with-caution, deprecated, and retired
states. “Available” is therefore separate from “safe, supported, and evidenced.” Stable components have
complete documentation, tests, and production history; experimental components can collect evidence
without implying permanent compatibility.

Source: [USWDS component lifecycle](https://designsystem.digital.gov/components/lifecycle/).

### Contribution and ownership

GOV.UK requires proposals to be useful and unique, then usable, consistent, and versatile before
publication. Evidence includes real use, user research including disabled users, reuse of existing
system parts, and cross-browser/device/assistive-technology testing. Its community process shares work
early, agrees scope and ownership, and uses formal maintainer review.

Primer illustrates a more centralised model: its checklist covers foundations reuse, API/code quality,
accessibility, documentation, and early specialist review; external contributions are currently
closed.

The main governance options are centralised, federated, and hybrid ownership. Their trade-off is
coherence and accountability versus review throughput and product-area participation.

Sources: [GOV.UK contribution criteria](https://design-system.service.gov.uk/community/contribution-criteria/),
[community principles](https://design-system.service.gov.uk/community/community-principles/),
[development process](https://design-system.service.gov.uk/community/develop-a-component-or-pattern/),
[Primer contribution guidance](https://primer.style/contribute),
[Primer design checklist](https://primer.style/product/contribute/design/).

### Public API and versioning

Semantic Versioning only works after a system declares its public API. A design-system API can include:

- component names and import paths;
- props, events, snippets/slots, defaults, and controlled-state contracts;
- token names and supported CSS custom properties;
- rendered semantics and accessibility behaviour;
- stable composition, theming, and responsive behaviour;
- DOM or CSS hooks, if consumers are allowed to depend on them.

Removing an export, token, hook, semantic behaviour, or default can therefore be breaking even when the
TypeScript prop type is unchanged. A project must decide which of these it promises to preserve.

Sources: [Semantic Versioning 2.0.0](https://semver.org/),
[SvelteKit packaging and exports](https://svelte.dev/docs/kit/packaging),
[USWDS packages](https://designsystem.digital.gov/components/packages/).

### Adoption and migration

USWDS’s maturity model explicitly supports incremental adoption: principles, then UX guidance, then
code. At code maturity it recommends inventorying existing components, converting values to tokens, and
replacing components progressively. Its major migration guidance acknowledges that full rewrites are
complex.

Material UI demonstrates deprecate-before-remove guidance, before/after replacement examples, and
codemods. Codemods scale syntactic migrations but cannot decide behavioural or design intent.

The main choices are big-bang replacement, incremental replacement, compatibility wrappers,
deprecation plus codemods, or enforcing only new/changed code. Each needs an inventory, ownership,
completion signal, and removal criteria to avoid a permanent dual system.

Sources: [USWDS maturity model](https://designsystem.digital.gov/maturity-model/),
[USWDS v2 migration](https://designsystem.digital.gov/documentation/migration-v2/),
[MUI deprecated API migration](https://mui.com/material-ui/migration/migrating-from-deprecated-apis/),
[MUI migration and codemods](https://mui.com/material-ui/migration/migration-v4/).

## Documentation, tests, and agent legibility

Storybook treats stories as captured component states. Autodocs derives API documentation from stories
and component metadata; MDX adds curated prose. Its current AI guidance recommends one concept per
story, descriptions that explain “why,” prop/component JSDoc, and curated manifests. It warns that too
little context prevents correct use while irrelevant context can also degrade agent results.

The current manifest/MCP agent features are preview and React-only, so they are evidence for good
information architecture rather than a ready-made Svelte solution.

No single conformance layer proves design-system compliance:

| Layer                       | What it can establish                                          |
| --------------------------- | -------------------------------------------------------------- |
| Types and curated exports   | Public API shape and import boundary                           |
| ESLint/import rules         | Selected dependency and syntax constraints                     |
| Token/style lint            | Whether values use approved sources                            |
| Interaction/component tests | Rendered behaviour and semantics                               |
| Accessibility automation    | A subset of accessibility failures                             |
| Visual comparison           | Appearance changes in captured states                          |
| Human review                | Design intent and whether an abstraction belongs in the system |

For coding agents, complementary representations are useful:

- concise instructions state the vocabulary and rationale;
- types and exports state the valid API;
- focused examples show intended use and non-use;
- lifecycle metadata excludes deprecated/experimental components when appropriate;
- specific lint/test failures provide local corrective feedback;
- templates make the preferred path easy without pretending every case is identical.

Sources: [Storybook stories](https://storybook.js.org/docs/8/writing-stories/index),
[Autodocs](https://storybook.js.org/docs/writing-docs/autodocs),
[documentation overview](https://storybook.js.org/docs/8/writing-docs),
[Storybook AI best practices](https://storybook.js.org/docs/ai/best-practices),
[Storybook manifests](https://storybook.js.org/docs/ai/manifests),
[ESLint restricted imports](https://eslint.org/docs/latest/rules/no-restricted-imports),
[ESLint custom rules](https://eslint.org/docs/latest/extend/custom-rule-tutorial),
[Stylelint configuration](https://stylelint.io/user-guide/configure/),
[Playwright visual comparisons](https://playwright.dev/docs/test-snapshots).

## Svelte and SvelteKit mechanics

These are framework constraints that can implement several different design-system theories.

### Composition

- Svelte 5 uses snippets and `{@render ...}` for reusable markup. Ordinary child content becomes the
  implicit `children` snippet.
- Typed `$props()` and `Snippet` props make component contracts explicit.
- Public wrappers can forward native attributes, ARIA attributes, data attributes, and event handlers
  through rest props.
- Callback props and normal event attributes such as `onclick` are the modern event model.

Sources: [Svelte snippets](https://svelte.dev/docs/svelte/snippet),
[Svelte `$props`](https://svelte.dev/docs/svelte/%24props),
[Svelte best practices](https://svelte.dev/docs/svelte/best-practices).

### Styling

- Component CSS is scoped by default.
- CSS custom properties are the supported parent/theme-to-child styling channel when a typed variant is
  not the appropriate API.
- Passing custom properties directly to a component can introduce a `display: contents` wrapper, which
  matters for selectors that assume direct DOM children.
- `:global` deliberately escapes component scoping and therefore represents a wider styling contract.

Sources: [scoped styles](https://svelte.dev/docs/svelte/scoped-styles),
[custom properties](https://svelte.dev/docs/svelte/custom-properties),
[styling child components](https://svelte.dev/docs/svelte/best-practices#Styling-child-components).

### Semantics and accessibility

- Svelte compile-time accessibility checks prefer native interactive semantics to click handlers on
  static elements.
- SvelteKit announces navigation using page titles and manages focus after navigation and enhanced form
  submissions.
- Every route needs a unique descriptive title for reliable announcements.

Sources: [Svelte compiler warnings](https://svelte.dev/docs/svelte/compiler-warnings),
[SvelteKit accessibility](https://svelte.dev/docs/kit/accessibility).

### Routes, data, and state

- Repeated application chrome belongs in the nearest shared `+layout.svelte`; nested layouts can own
  section-specific shells.
- Server-only data access belongs in server load functions or actions. Universal loads can execute on
  server and browser.
- Load functions should return data rather than mutate global state.
- Module-level mutable user/request state is unsafe under SSR; subtree context or page data provides
  scoped ownership.
- `$derived` is for computation; `$effect` is primarily an external-system synchronisation escape hatch.

Sources: [SvelteKit routing and layouts](https://svelte.dev/docs/kit/routing#+layout),
[loading data](https://svelte.dev/docs/kit/load#Universal-vs-server),
[state management](https://svelte.dev/docs/kit/state-management),
[Svelte best practices](https://svelte.dev/docs/svelte/best-practices).

### Forms and progressive enhancement

SvelteKit form actions use native form submission and work without client JavaScript. `use:enhance`
adds client behaviour while preserving the native model. Design-system form controls therefore need to
preserve native labels, fieldsets, descriptions, errors, focus, names, and submission semantics rather
than obscure them.

Source: [SvelteKit form actions](https://svelte.dev/docs/kit/form-actions).

### SSR and performance

- SSR is the default and disabling it produces an empty client shell; it is not generally recommended.
- Initial server and client markup should derive from the same serialisable inputs.
- SvelteKit already provides route splitting, preload, parallel loading, request coalescing, and
  conservative invalidation.
- Repeated lists should use stable keys; genuinely heavy optional UI can be dynamically imported.

Sources: [SvelteKit page options](https://svelte.dev/docs/kit/page-options#ssr),
[SvelteKit performance](https://svelte.dev/docs/kit/performance),
[Svelte each-block guidance](https://svelte.dev/docs/svelte/best-practices#Each-blocks).

## Mapping the current repository without choosing a replacement

### Current model

The accepted ADRs describe three layers:

- `$lib/ui`: domain-agnostic “primitives” owning appearance and accessibility;
- `$lib/components`: domain-aware, pure props-in/callbacks-out presentation;
- `src/routes`: data, state, behaviour, and arrangement.

The system also has global tokens, scoped CSS, typed variants, a public UI barrel, and dev-only
full-fidelity prototype routes.

### Where common theories interpret the same code differently

| Current item                             | Atomic lens                                    | Layout lens                                  | Foundations/components/patterns lens              |
| ---------------------------------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| `Button`, `Badge`, `Text`                | Atoms                                          | Not primarily layout                         | Low-level components                              |
| `Row`, `Grid`, `Col`, `Spacer`           | Atoms or molecules depending on interpretation | Layout primitives                            | Composition/layout foundations                    |
| `StatCard`, `ChartPanel`, `SectionIntro` | Molecules/organisms                            | Compositions using layout                    | Reusable patterns, despite living with primitives |
| `MasterDetail`                           | Organism/template                              | Sidebar/master-detail layout plus appearance | Page pattern or shell                             |
| `MetricsTopBar`, `SessionDetailHeader`   | Organisms                                      | Consumers of layout                          | Domain patterns/presentational components         |
| `OverviewView`, `SessionsView`           | Templates                                      | Page compositions                            | Feature/view UI                                   |
| `+page.svelte`                           | Page                                           | Route consumer                               | Concrete page instance                            |

The repo’s word **primitive** means “domain-independent,” not “smallest,” “atomic,” “unstyled,” or
“single responsibility.” That is internally coherent but conflicts with common meanings. `Button`,
`Grid`, `StatCard`, `ChartPanel`, `SectionIntro`, and `MasterDetail` consequently share one category
despite having very different composition depth and responsibilities.

### The `Grid` question under different theories

- **Atomic Design:** does not decide. `Grid` might be an atom/molecule, while a route composition might
  be a template. The theory does not specify whether CSS Grid must be wrapped.
- **Every Layout:** use a reusable Grid only when it represents the documented intrinsic layout
  algorithm; unique spatial compositions may use another primitive or local composition.
- **CUBE CSS:** Grid-like flow usually belongs to Composition, which could be a class or component. It
  does not require a framework wrapper.
- **Current container/presentational ADR:** containers explicitly own grids, flex, gaps, and arrangement,
  while `Grid`/`Col` also exist in `$lib/ui`. Both owners are authorised.
- **Foundations/components/patterns:** a layout primitive can own recurring layout, while patterns and
  pages compose it; the system still needs an exception/promotion policy.

The current `Grid` has equal tracks and a fixed gap; local route CSS expresses equal columns, `2fr 1fr`,
and `auto-fit`. Some local layouts overlap with the component API and some do not. The inconsistency is
therefore partly API coverage and partly an unresolved ownership rule.

### Other open seams visible in the repo

- `MasterDetail` combines a layout algorithm with border, surface, and detail-pane appearance, so it is
  both a layout primitive and a styled pattern.
- Route folders contain page entries, view containers, state adapters, chart integration, mock data,
  aggregation, and metadata. “Container” consequently covers more than a data-bound page boundary.
- `Chart.svelte` owns imperative third-party lifecycle and rendering infrastructure but fits neither the
  pure presentational definition nor an ordinary page container cleanly.
- The provisional component folder mixes controls/patterns for several Viewer areas and presentation
  types used by route code; a future second feature would test whether the organising unit is layer or
  feature.
- “shadcn-style” currently refers to data-attribute variants, class merging, and rest forwarding. It does
  not mean the repo uses a headless library or the full shadcn composition model.
- Prototype documentation calls prototypes full-fidelity real app code, while active agent instructions
  and visible UI still call them throwaway. That gives coding agents conflicting confidence signals.
- Responsive behaviour, component maturity, deprecation, contribution evidence, API compatibility, and
  exception ownership are not yet defined as system-wide contracts.

## Neutral architecture candidates for later evaluation

These are evaluation shapes, not recommendations.

### Candidate A: retain and clarify the current three-layer model

Keep domain independence as the primary organising seam. Define subcategories or metadata inside
`$lib/ui` for controls, layout, and generic compositions; define exactly when route arrangement should
use a layout API and when local CSS is expected.

Questions to test:

- Can one directory/barrel remain discoverable as the inventory grows?
- Does the binary domain-import rule matter more than composition depth?
- Can layout and pattern ambiguity be resolved without adding folders?

### Candidate B: foundations → layout/behaviour → components → patterns → features → pages

Separate independent responsibility axes into explicit layers. Product/domain features consume the
design system but are not themselves necessarily part of its portable core.

Questions to test:

- Are the extra seams precise enough to justify more folders and import rules?
- Where do styled controls built on behavioural primitives live?
- Is a pattern domain-independent, user-task-specific, or both?

### Candidate C: Atomic Design as the primary catalogue

Organise or document the system as atoms, molecules, organisms, templates, and pages, potentially with
tokens/foundations alongside it.

Questions to test:

- Can contributors consistently classify current `StatCard`, `SectionIntro`, `MasterDetail`, and
  Viewer headers?
- What separate model governs state, data, layout algorithms, and feature ownership?
- Is Atomic terminology shared with the people designing the product, or only imposed on code?

### Candidate D: a portable design-system core plus feature-sliced application UI

Keep foundations, layout, and reusable control contracts in a small public UI package/barrel. Organise
domain UI, state, data, and tests by Viewer/feature with public feature entry points.

Questions to test:

- Which existing components are genuinely portable across features?
- Do presentation view models belong to the feature or the component?
- How are cross-feature patterns promoted without creating a second flat component directory?

### Candidate E: CSS-first composition plus fewer layout components

Use a CUBE-like composition/utility layer for spatial rules, reserve Svelte components for semantics,
behaviour, stable styled controls, and product patterns, and accept native elements as composition
carriers.

Questions to test:

- Does this fit the accepted component-scoped CSS ADR, or require reopening it?
- Can global composition utilities stay small and token-driven?
- Would coding agents apply utilities more consistently than component APIs?

## Questions that need answers before selecting a convention

1. Is the design system intended only for this app, for several products, or for publication as a
   package?
2. Is the primary pain compositional scale, layout duplication, accessibility behaviour, visual drift,
   feature coupling, or agent discoverability?
3. What does “primitive” need to mean here: domain-independent, low-level, headless, single-purpose, or
   all of those?
4. Should domain-aware patterns be considered part of the design system or consumers of it?
5. Should reusable layout live in Svelte components, CSS composition classes, or both?
6. What evidence promotes a local composition into the shared system: second use, cross-feature use,
   user research, accessibility complexity, or another threshold?
7. Which native elements should remain directly available, and which behaviours must go through an
   owned control API?
8. What is public and versioned: exports, props, tokens, semantics, DOM, responsive behaviour, CSS
   hooks, or visual defaults?
9. Is experimentation represented by a folder, lifecycle status, version channel, prototype route, or
   some combination?
10. Who may add/change components, who reviews them, and who owns them after acceptance?
11. Which representations should coding agents consult: concise instructions, generated API catalogue,
    focused examples, stories/prototype states, manifests, or scaffolds?
12. Which rules are sufficiently objective for automation, and which require explicit design review?

Answering those questions would make the later repo convention an informed architectural decision
rather than a reaction to one `Grid` example.
