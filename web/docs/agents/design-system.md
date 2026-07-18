# Design system

How to build and change web UI. All UI is **composition of `$lib/ui` primitives** styled by a
**design-token** layer with **component-scoped CSS** — no Tailwind, no shared BEM stylesheet. The
_why_ is [ADR-0001](../adr/0001-design-system-scoped-css-tokens-variants.md); this is the _how_.

## Where things live

| Path                        | Role                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/styles/tokens.css` | Design tokens on `:root` (colour, spacing, radii, type, focus). Imported once in the root `+layout.svelte`. Plus the one global reset (`box-sizing`). |
| `src/lib/ui/`               | The primitive components + `index.ts` barrel and `utils.ts` (`cn`).                                                                                   |
| `src/lib/actions/`          | Behavioural actions, e.g. `clickable` (keyboard/ARIA for non-button rows).                                                                            |

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

## Extending

- **New variant** — add a `data-*` branch in the primitive's scoped `<style>` and widen the prop's
  union type. Keep the base class untouched.
- **New primitive** — one file in `src/lib/ui/`, follow the contract (variant `data-*` + `cn(class)` +
  `...rest`), export it from `index.ts`. Own its DOM and a11y.
- **New token** — add it to `tokens.css` under the right group; reference via `var(--…)`.

Primitive prop types are the source of truth for each component's API — read the `.svelte` file when
the table above isn't enough.
