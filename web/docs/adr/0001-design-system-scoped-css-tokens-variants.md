# Web UI is a scoped-CSS design system: tokens + shadcn-style variant primitives

**Status:** accepted

All web UI is composed from a primitive kit in `src/lib/ui/`, styled with Svelte **component-scoped CSS** driven by a global **design-token** layer (`src/lib/styles/tokens.css`). Each primitive exposes a typed **variant/size** surface resolved through `data-*` attributes and scoped attribute selectors (a `cva` analogue for scoped CSS), plus a `class` merge hook (`cn`) and `...rest` spread. Accessibility is owned by the primitives (native `<button>`, `aria-pressed`, the `clickable` action for non-button rows), and `svelte-check` runs with `--fail-on-warnings` so a11y regressions fail the build. The consumer guide is [`docs/agents/design-system.md`](../agents/design-system.md).

## Considered Options

- **Tailwind (+ shadcn-svelte).** Rejected: adds a build/config/purge surface and a second styling vocabulary for a small app that already used CSS custom properties; Svelte's scoped CSS already gives isolation. We keep shadcn's _ideas_ (one component, many variants; `class` + rest override; composition) without its utility-class dependency.
- **Keep the shared BEM stylesheet** (the prototype's original `metrics-viewer.css`, ~815 lines of `.mv`-prefixed classes). Rejected: it fights Svelte's per-component scoping, drifts easily, and hides accessibility inside ad-hoc markup rather than reusable primitives.
- **CSS-in-JS / styled runtime.** Rejected: extra runtime and tooling for zero benefit over compiled scoped CSS + tokens.

## Consequences

- Cross-component styling flows through **tokens**, not shared classes; one-off layout lives in the owning component's scoped `<style>`. There is no shared UI stylesheet to drift.
- New visual patterns are added as a **variant** (`data-*` branch + widened union) or a new primitive — never by reintroducing global classes.
- Interactive elements must be primitives (or use the `clickable` action); raw `<a href="#">` / `<div onclick>` controls are disallowed and caught by the warnings-as-errors check.
- Primitive prop types are the component API; the guide's inventory table is a map, the `.svelte` files are the reference.
- This is web-context-specific: it lives under `web/docs/adr/` (context-scoped decisions), not the repo-wide `docs/adr/`. Design-system vocabulary (primitive, variant, token) stays in the guide, not the domain glossary — consistent with [ADR-0002](0002-prototypes-as-dev-only-sveltekit-routes.md) keeping build-workflow terms out of `domain.md`.
