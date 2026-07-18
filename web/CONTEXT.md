# Web

The SvelteKit application: the **control plane** for LLM Retro and the home of the Viewers. Reads the shared kernel in [`../CONTEXT-MAP.md`](../CONTEXT-MAP.md); this file adds only web-specific language.

## Language

**Control plane**:
The web app as the single place work is triggered and observed. Jobs never run implicitly — every extraction or analysis run is an explicit action initiated here.
_Avoid_: Dashboard, admin, backend.

**Metrics view**:
The Viewer that renders Signals — deterministic, authoritative figures over the filtered Sessions in scope.

**Insights view**:
The Viewer that renders Inferences — the model-derived, explicitly non-authoritative Retro layer over the same Sessions in scope.

(Both are concrete realisations of the shared-kernel term _Viewer_.)

## Build & UI conventions

These are architecture/workflow vocabulary, deliberately kept out of the glossary (see ADR-0010) and documented for agents under `docs/agents/`:

- **Design system** — all UI is composed from the `$lib/ui` primitive kit (typed variants, design tokens, scoped CSS). Read [`docs/agents/design-system.md`](docs/agents/design-system.md) before building or changing web UI; the rationale is [`docs/adr/0001-design-system-scoped-css-tokens-variants.md`](docs/adr/0001-design-system-scoped-css-tokens-variants.md).
- **Prototypes** — throwaway, dev-only design experiments under `/prototype`. See [`../docs/agents/prototyping.md`](../docs/agents/prototyping.md).
