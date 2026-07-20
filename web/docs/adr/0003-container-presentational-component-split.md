# UI is a container/presentational split; presentational components own their appearance

**Status:** superseded by [ADR-0004](0004-ui-architecture-independent-axes.md) (historical decision retained below)

Web UI is built in three layers with a strict separation of _appearance_ from _layout and data_:

- **Primitive** (`src/lib/ui/`) — domain-agnostic building block. Never imports a domain type. `Button`, `Card`, `Badge`, plus generic compositions promoted here (`StatCard`, `ChartPanel`, `AccentPanel`).
- **Presentational component** (`src/lib/components/`) — a domain-_aware_ composition that **owns its entire appearance** (structure _and_ styling). **Props in, callbacks out**: no data fetching, no store/state access, no side effects (no navigation, no DOM reaching). Testable in isolation by rendering with props. `JobCard`, `InferenceCard`, `SessionRow`.
- **Container** (route / page / layout) — owns **data and arrangement**: grids, flex, gaps, wiring data down and callbacks up, composing components together. It is **ignorant of how any component looks**; its own `<style>` contains **layout properties only** (`display`, `grid-template`, `flex`, `gap`, `max-width`, alignment) — never `border`, `background`, `border-radius`, decorative `padding`, colour, or type treatment.

The seam between primitive and presentational is one enforceable binary: **does this file import a domain type?** Domain-agnostic → `$lib/ui`; domain-aware → `$lib/components`.

**Extraction is triggered, not upfront.** A container may compose primitives inline, but MUST extract a named presentational component the instant any one holds: it _repeats_, it _needs appearance CSS of its own_, or it _carries domain meaning worth testing_. Writing a `border`/`background` in a page's `<style>` is the smell that the trigger has fired.

## Considered Options

- **Two layers only (primitive + page), compose inline everywhere** (the status quo that prompted this). Rejected: domain compositions like `InferenceCard` had nowhere to live but inline in the page, so they were hand-rolled with bespoke CSS and the same "left-accent card" shape was copy-pasted across four components. Pages ended up knowing how things look, which is untestable and drifts.
- **Atomic Design taxonomy (atoms/molecules/organisms folders).** Rejected as the _organising_ seam: the molecule-vs-organism line is perennially fuzzy and invites reclassification churn. We keep the _idea_ (small pieces compose into bigger ones) but organise on the domain line, which is binary and enforceable.
- **One `$lib/components` folder for everything reusable.** Rejected: it intermixes domain-agnostic and domain-aware code, coupling the kit to the domain model. Keeping `$lib/ui` free of domain types lets the kit be reasoned about, tested, and restyled independently.
- **Strict rule: pages never assemble primitives, every grouping is a named component.** Rejected: too heavy for one-offs. The _triggered_ extraction rule preserves the freedom to compose inline until drift actually begins.

## Consequences

- Presentational components are pure prop→pixel and callback-out, so they are unit-testable without a DOM data source, router, or store; the container supplies data and behaviour.
- Side-effecting behaviour that used to hide in a "card" (DOM scrolling, view switching, job triggering) becomes a callback prop the container owns.
- `$lib/ui` gains generic compositions (`StatCard`, `ChartPanel`, `AccentPanel`) as first-class primitives; the duplicated left-accent panel becomes one `AccentPanel`.
- Provisional presentational components live in `$lib/components/prototypes/` during design and graduate to `$lib/components/` on promotion — see [ADR-0002](0002-prototypes-as-dev-only-sveltekit-routes.md).
- This is web-context-specific: it lives under `web/docs/adr/`. Architecture vocabulary (_presentational_, _container_, _promote_) stays in the agent guides, not `domain.md` — consistent with [ADR-0001](0001-design-system-scoped-css-tokens-variants.md) and [ADR-0002](0002-prototypes-as-dev-only-sveltekit-routes.md). It builds on ADR-0001: primitives keep the scoped-CSS/token/variant contract; this ADR adds the layers above them.
