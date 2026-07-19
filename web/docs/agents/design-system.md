# Design system

How to build and change web UI. UI is built in **three layers** with a strict split of _appearance_
from _layout and data_ ([ADR-0003](../adr/0003-container-presentational-component-split.md)), all
styled by a **design-token** layer with **component-scoped CSS** — no Tailwind, no shared BEM
stylesheet ([ADR-0001](../adr/0001-design-system-scoped-css-tokens-variants.md)). This is the _how_.

## The three layers

| Layer                        | Lives in              | Knows the domain? | Owns                                                      |
| ---------------------------- | --------------------- | ----------------- | --------------------------------------------------------- |
| **Primitive**                | `src/lib/ui/`         | No                | Its own appearance + a11y; generic, reusable anywhere     |
| **Presentational component** | `src/lib/components/` | Yes               | Its **entire appearance** (structure + styling)           |
| **Container** (page/layout)  | `src/routes/**`       | Yes               | **Data + arrangement** only — never how a component looks |

- **Primitive** — domain-agnostic; never imports a domain type. `Button`, `Card`, `Badge`, plus
  generic compositions promoted here (`StatCard`, `ChartPanel`, `AccentPanel`).
- **Presentational component** — a domain-_aware_ composition. **Props in, callbacks out**: no data
  fetching, no store/state access, no side effects (no navigation, no DOM reaching). Trivially
  testable by rendering with props. `JobCard`, `InferenceCard`, `SessionRow`.
- **Container** — owns data and arrangement (grids, flex, gaps, wiring data down and callbacks up,
  composing components together). Ignorant of appearance; its `<style>` is **layout-only** (`display`,
  `grid-template`, `flex`, `gap`, `max-width`, alignment) — never `border`, `background`,
  `border-radius`, decorative `padding`, colour, or type treatment.

The primitive/presentational seam is one binary: **does this file import a domain type?**
Domain-agnostic → `$lib/ui`; domain-aware → `$lib/components`.

**Extraction is triggered, not upfront.** A container may compose primitives inline, but MUST extract
a named presentational component the instant any one holds: it _repeats_, it _needs appearance CSS of
its own_, or it _carries domain meaning worth testing_. Writing a `border`/`background` in a page's
`<style>` is the signal the trigger has fired.

## Where things live

| Path                             | Role                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/styles/tokens.css`      | Design tokens on `:root` (colour, spacing, radii, type, focus). Imported once in the root `+layout.svelte`. Plus the one global reset (`box-sizing`).                |
| `src/lib/ui/`                    | Domain-agnostic primitives + `index.ts` barrel and `utils.ts` (`cn`).                                                                                                |
| `src/lib/components/`            | Domain-aware presentational components.                                                                                                                              |
| `src/lib/components/prototypes/` | Provisional presentational components under design; promote to `src/lib/components/` or delete ([ADR-0002](../adr/0002-prototypes-as-dev-only-sveltekit-routes.md)). |
| `src/lib/actions/`               | Behavioural actions, e.g. `clickable` (keyboard/ARIA for non-button rows).                                                                                           |

Import primitives from the barrel: `import { Button, Card, Row } from '$lib/ui';`

## The variant model (shadcn-style, CSS-native)

Every primitive follows the same three-part contract, so they compose predictably:

1. **Variant/size props** resolve to `data-*` attributes on the root element; scoped CSS targets
   them with attribute selectors (`.btn[data-variant='pill']`). This is our `cva` analogue — the
   variant surface is data attributes, not generated class strings.
2. **`class` prop** is merged after the base class via `cn()` — the override/extension hook.
3. **`...rest` is spread** onto the root element, so `data-*`, `title`, `style`, `aria-*`, and event
   handlers pass straight through.

```svelte
<Button variant="link" onclick={openInsights}>Open in Insights →</Button>
<Toggle pressed={st.tools.has(t)} tone={t} onclick={() => st.toggleTool(t)}>{t}</Toggle>
<Card><CardTitle>By model</CardTitle>…<CardHint>{n} sessions</CardHint></Card>
```

Tokens are always referenced by name (`var(--accent)`), never re-hardcoded. Colour tints for tool
identity are tokens too (`--claude-tint`, etc.).

## Primitive inventory

| Component                         | Purpose                               | Key variants / props                                               |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `Button`                          | Any action                            | `variant: solid\|outline\|ghost\|link\|pill`, `size`               |
| `Toggle`                          | Pressable pill (`aria-pressed`)       | `pressed`, `tone: default\|claude\|codex\|pi\|model`               |
| `Segmented<T>`                    | Single-select button group            | `options`, `value`, `onchange`, `variant: inset\|outline`, `label` |
| `Badge`                           | Small status/identity tag             | `tone: neutral\|claude\|codex\|pi`                                 |
| `Card` / `CardTitle` / `CardHint` | Panel container + header + hint       | composition                                                        |
| `Kpi`                             | Big stat figure                       | `delta: none\|up\|down`, `unit?`                                   |
| `Verdict`                         | Accent "reads as" callout             | `label` + children                                                 |
| `Chip`                            | Compact tag; interactive if `onclick` | `onclick?`, `variant: default\|more`                               |
| `Banner`                          | Inline notice bar                     | `tone: warn\|info`                                                 |
| `Row` / `Spacer`                  | Flex row + flexible gap filler        | `Row.align`                                                        |
| `Text`                            | Inline text treatment                 | `tone: default\|muted\|dim\|warn`, `mono?`                         |
| `Grid` / `Col`                    | Column grid + spanning cell           | `Grid.cols`, `Col.span`                                            |
| `MasterDetail`                    | 380px list rail + detail pane         | `list` + `detail` snippets                                         |
| `SelectableRow`                   | Accessible selectable list row        | `selected`, `onselect`, `layout: block\|grid`                      |

## Rules

- **No raw interactive elements.** No `<a href="#">`, no `<span onclick>`/`<div onclick>` acting as
  controls. Use `Button`/`Toggle`/`Chip`/`Segmented`/`SelectableRow`, or the `clickable` action for a
  bespoke non-button element. `pnpm check` runs `svelte-check --fail-on-warnings`, so a11y warnings
  fail the build.
- **Compose, don't restyle.** Reach for a primitive/variant first. Genuinely one-off layout goes in
  that component's own scoped `<style>`, tokens only — never a new shared stylesheet.
- **Tokens only.** Don't hardcode a hex/spacing value that a token already names.
- **Containers own layout, not looks.** A page/layout `<style>` holds layout properties only
  (`display`, `grid-template`, `flex`, `gap`, `max-width`, alignment). A `border`, `background`,
  `border-radius`, decorative `padding`, colour, or type treatment in a route means you should be
  extracting a presentational component instead.
- **Presentational components are pure.** Props in, callbacks out. No `load`/`fetch`, no store or
  viewer-state access, no navigation or DOM reaching — the container passes those in as callbacks.
- **Extract on the trigger.** Pull an inline composition into a named component the instant it
  repeats, needs its own appearance CSS, or carries domain meaning worth testing.

## Extending

- **New variant** — add a `data-*` branch in the primitive's scoped `<style>` and widen the prop's
  union type. Keep the base class untouched.
- **New primitive** (domain-agnostic) — one file in `src/lib/ui/`, follow the contract (variant
  `data-*` + `cn(class)` + `...rest`), export it from `index.ts`. Own its DOM and a11y. Never import a
  domain type here.
- **New presentational component** (domain-aware) — one file in `src/lib/components/` (or
  `src/lib/components/prototypes/` while still under design). Compose primitives; own the whole look;
  props in, callbacks out.
- **New token** — add it to `tokens.css` under the right group; reference via `var(--…)`.

Primitive prop types are the source of truth for each component's API — read the `.svelte` file when
the table above isn't enough.
