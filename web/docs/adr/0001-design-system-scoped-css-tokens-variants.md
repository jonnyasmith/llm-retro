# Web UI uses scoped CSS, semantic tokens, and variants

**Status:** accepted

All web UI is composed from the shared design system under `src/lib/design-system/`, styled with Svelte **component-scoped CSS** driven by a global **design-token** foundation. Components expose typed **variant/size** surfaces resolved through `data-*` attributes and scoped attribute selectors (a `cva` analogue for scoped CSS), plus a `class` merge hook (`cn`) and safe `...rest` forwarding. Accessibility is owned by the layer that implements the interaction (native `<button>`, `aria-pressed`, and equivalent accessible behaviour), and `svelte-check` runs with `--fail-on-warnings` so a11y regressions fail the build. The consumer guide is [`docs/agents/design-system.md`](../agents/design-system.md).

## Considered Options

- **Tailwind (+ shadcn-svelte).** Rejected: adds a build/config/purge surface and a second styling vocabulary for a small app that already used CSS custom properties; Svelte's scoped CSS already gives isolation. We keep shadcn's _ideas_ (one component, many variants; `class` + rest override; composition) without its utility-class dependency.
- **Keep the shared BEM stylesheet** (the prototype's original `metrics-viewer.css`, ~815 lines of `.mv`-prefixed classes). Rejected: it fights Svelte's per-component scoping, drifts easily, and hides accessibility inside ad-hoc markup rather than reusable primitives.
- **CSS-in-JS / styled runtime.** Rejected: extra runtime and tooling for zero benefit over compiled scoped CSS + tokens.

## Consequences

- Cross-component styling flows through **tokens**, not shared classes; one-off layout lives in the owning component's scoped `<style>`. There is no shared UI stylesheet to drift.
- New visual patterns are added as a **variant** (`data-*` branch + widened union) or a new shared component — never by reintroducing global classes.
- Interactive behaviour must be implemented by the layer that owns its semantics and accessibility; raw `<a href="#">` / `<div onclick>` controls are disallowed and caught by the warnings-as-errors check.
- Component prop types are the component API; the guide and stories explain intended use, while the `.svelte` files remain the reference.
- This is web-context-specific: it lives under `web/docs/adr/` (context-scoped decisions), not the repo-wide `docs/adr/`. Design-system vocabulary stays in the guide, not the domain glossary. Composition, ownership, and lifecycle are decided separately by [ADR-0004](0004-ui-architecture-independent-axes.md).
