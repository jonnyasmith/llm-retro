# Web

The SvelteKit application: the control plane for LLM Retro and the home of the Viewers. Solution-wide terms (Session, Signal, Inference, Retro…) live in the root [`domain.md`](../../../docs/agents/domain.md).

## Language

**Control plane**:
The web app as the single place work is triggered and observed. Jobs never run implicitly — every extraction or analysis run is an explicit action initiated here.
_Avoid_: Dashboard, admin, backend.

**Viewer**:
A consumer that renders finalised data. v1 has two — the Metrics view and the Insights view — over the same extracted data.

**Metrics view**:
The Viewer that renders Signals: deterministic, authoritative figures over the Sessions in scope.

**Insights view**:
The Viewer that renders Inferences: the model-derived, explicitly non-authoritative Retro layer over the same Sessions.
