# Signals are deterministic-only; interpretation is the Inference layer

**Status:** accepted

A **Signal** is a deterministic structured fact — a pure function of one Normalised Session: exact, cheap, re-runnable, with **no model call**. Any fact that requires interpretive judgement (course-corrections, input-noise waste, the dumb-zone threshold) is **not** a Signal; it is an **Inference**, produced by the LLM analysis layer ([jobs ADR-0002](../../jobs/docs/adr/0002-inferences-via-subscription-authed-cli-in-container.md)). This draws the dividing line the whole Job split rests on, and fills the gap flagged as "(ADR none; see #4)" in jobs ADR-0002.

## Considered Options

- **Let Signals include lightweight heuristics** (e.g. regex-detected "re-prompts" counted as course-corrections). Rejected: a re-prompt caused by an AI miss needs judgement to tell it from an ordinary follow-up; a heuristic masquerading as a deterministic Signal would be silently wrong and un-auditable.
- **One undifferentiated "analysis output" concept.** Rejected: deterministic outputs and model-derived outputs have different re-run, provenance, and trust properties ([ADR-0002](0002-jobs-as-self-describing-containers.md) vs [jobs ADR-0002](../../jobs/docs/adr/0002-inferences-via-subscription-authed-cli-in-container.md)); collapsing them loses the "Signals are the source of truth, Inferences are non-authoritative" guarantee.

## Consequences

- Signals need no provenance stamp and re-run purely on extraction or Job-version change ([ADR-0002](0002-jobs-as-self-describing-containers.md)); Inferences are stamp-gated and carry provenance ([jobs ADR-0002](../../jobs/docs/adr/0002-inferences-via-subscription-authed-cli-in-container.md)).
- Signals stay the deterministic source of truth; Inferences are marked model-derived and non-authoritative in the data model and surfaced as such in the Viewer.
- The glossary (`domain.md`) carries both terms. The concrete v1 taxonomy (8 Signals) lives in the PRD and accretes without disturbing this boundary.
- Facts once mooted as Signals move to the Inference layer: corrections/re-prompts, input-noise waste, and the dumb-zone threshold (dumb-zone *detection* is an Inference; the cross-session *aggregate* threshold is a deterministic roll-up of those detections).

Decided in [#4](https://github.com/jonnyasmith/llm-retro/issues/4).
