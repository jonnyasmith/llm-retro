# Storybook versus a bespoke SvelteKit UI lab

**Date:** 2026-07-20  
**Scope:** Decide which development surface should support the proposed UI architecture. This is
research input for a replacement ADR, not the decision itself.

## Conclusion

Adopt Storybook as the standing design-system workbench and replace the proposed broad SvelteKit UI
lab with a deliberately thin sibling SvelteKit scenario app. Keep the real application and its
end-to-end tests as the final integration surface.

This is a qualified replacement:

- Storybook owns foundations, atoms, molecules, organisms, templates, and pure page/view states.
- The sibling scenario app owns experiments that require real route orchestration, `load`, SSR,
  form actions, layout inheritance, server modules, or navigation.
- The real application owns production integration behaviour and end-to-end proof.
- Each scenario must justify why a story cannot represent it and have an explicit deletion or
  promotion criterion. The scenario app must not become a second component gallery.

Maintaining both Storybook and a permanent UI-lab would create two catalogues, two sets of examples,
and two possible sources of truth. That directly recreates the drift the design-system change is
intended to prevent.

## Why Storybook fits this repository

Storybook officially supports SvelteKit and all Svelte language features. It supports `$lib`, public
environment modules, and selected SvelteKit modules directly or through mocks. Stories are
development-only captured component states, and Storybook explicitly supports the spectrum from
small atomic components to pure presentational pages.

That aligns with the proposed separation of route orchestration from prop-driven UI. The more that
templates and pages follow the repository's props-in/callbacks-out rule, the less Storybook-specific
mocking they need. The local code is well positioned for this split: `web/src/lib` contains 74 Svelte
or TypeScript files with no `$app/*` or `$env/*` imports, including 46 Svelte components under
`ui`/`components`. The current `/prototype` tree contains 22 files, so moving its catalogue role is a
material simplification rather than adding tooling around an empty system.

Storybook also supplies capabilities a bespoke gallery would otherwise have to recreate:

- controls and viewport tooling;
- Autodocs and curated MDX guidance;
- one named state per story, colocated with the component;
- interaction and render tests through the Vitest addon in a real browser;
- axe-based automated accessibility checks;
- lifecycle and ownership metadata through custom tags;
- optional visual regression through Chromatic.

Sources: [Storybook for SvelteKit](https://storybook.js.org/docs/get-started/frameworks/sveltekit),
[writing stories](https://storybook.js.org/docs/8/writing-stories/index),
[building pages](https://storybook.js.org/docs/10.5/writing-stories/build-pages-with-storybook),
[Autodocs](https://storybook.js.org/docs/writing-docs/autodocs),
[Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon/index),
[accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing),
[tags](https://storybook.js.org/docs/writing-stories/tags).

## Boundaries and costs

Storybook is client-rendered and built as a static application. Private environment modules and
service-worker behaviour are unsupported; forms, navigation, and `$app/state` support are documented
as experimental mocks. It therefore cannot prove real SvelteKit routing, SSR, loaders, form actions,
or server integration.

Visual regression is not a free local capability of Storybook itself. Its official cross-browser
workflow uses the hosted Chromatic service. A repository-owned Playwright screenshot workflow is a
separate alternative, with its own baseline-environment maintenance.

Storybook is also a substantial toolchain dependency. It ships major releases roughly yearly and
actively maintains only the latest major for general fixes. The project must budget for upgrades and
keep Storybook's build and story tests inside the normal verification gate. The current web stack is
on Svelte 5, SvelteKit 2, Vite 8, Vitest 4, and pnpm 10; these exceed Storybook's documented minimums,
but compatibility must be proven with a time-boxed spike before accepting the ADR because the stack
is newer than several minimum-version statements.

Storybook's preview AI manifests and MCP support are currently React-only. Storybook will improve the
human-readable and executable examples available to coding tools, but it is not currently a
machine-readable Svelte design-system oracle. Repository instructions, curated exports, lint rules,
and tests remain necessary.

Sources: [SvelteKit support matrix](https://storybook.js.org/docs/get-started/frameworks/sveltekit),
[visual testing](https://storybook.js.org/docs/8/writing-tests/visual-testing),
[Storybook releases](https://storybook.js.org/docs/releases),
[AI manifests](https://storybook.js.org/docs/ai/manifests).

## Mapping to the three independent axes

Storybook is a documentation and test surface, not the source-code architecture. Its sidebar should
make the axes visible without collapsing them into one folder hierarchy.

| Axis        | Source-code meaning                                             | Storybook representation                                                                          |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Composition | foundations → atoms → molecules → organisms → templates → pages | Primary sidebar hierarchy or explicit story title                                                 |
| Ownership   | shared design system → feature-owned UI → route orchestration   | Story title plus ownership tags; route orchestration belongs in the thin scenario app or real app |
| Lifecycle   | experimental → stable → deprecated → retired                    | Custom tags and default filters; retired stories are removed after migration                      |

The same component can therefore be a shared molecule and experimental without inventing a folder
that tries to encode both facts. Storybook's official tag support explicitly includes status and
ownership as example uses.

## Recommended adoption shape

1. Run a narrow compatibility spike with current Svelte, SvelteKit, Vite, Vitest, TypeScript, and
   pnpm versions. Prove tokens/global CSS, snippets, events, accessibility tests, one interaction test,
   one template, and one mocked page state.
2. If the spike passes, accept a replacement ADR that adopts Storybook and supersedes the part of
   ADR-0002 that rejects a standing Storybook catalogue.
3. Migrate existing `/prototype` states into stories at the correct composition level. Extract pure
   templates/pages from route orchestration rather than storying `+page.svelte` files directly.
4. Move only genuinely route-dependent experiments into a thin sibling SvelteKit scenario app, with
   a reason and exit criterion recorded for each scenario. Delete the in-app `/prototype` gallery
   once equivalent story/scenario coverage exists.
5. Add Storybook build and story tests to the repository verification gate. Decide separately whether
   hosted Chromatic or deterministic Playwright screenshots are worth their cost.

The decision should be revisited if the compatibility spike exposes material Svelte/Vite friction, or
if most important UI states cannot be represented without extensive SvelteKit mocks. In that case,
expanding the sibling scenario app becomes justified by evidence rather than preference.
