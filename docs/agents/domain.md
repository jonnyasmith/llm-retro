# LLM Retro

A tool for retrospectively reviewing your own AI-coding sessions (Claude, Codex, pi) to learn what works and what doesn't over time. Ingests local session transcripts, extracts structured signals, and serves both quantitative metrics and emergent qualitative insights.

## Language

Solution-wide concepts shared across the whole system. Each app defines its own inner-domain vocabulary in its own `docs/agents/domain.md` (e.g. `web/docs/agents/domain.md`, `db/docs/agents/domain.md`, `jobs/docs/agents/domain.md`).

**Session**:
One recorded conversation between the user and an AI coding tool, from a single transcript on disk.
_Avoid_: Conversation, chat, thread.

**Tool**:
One of the AI coding products the user drives: Claude (Code), Codex, or pi. Each stores Sessions in its own format.
_Avoid_: Agent, assistant, provider.

**Signal**:
A structured fact mechanically derived from one Session — exact, cheap, re-runnable, no model call. E.g. turn count, tokens, model-per-phase, subagent usage.
_Avoid_: Metric, feature, datapoint.

**Inference**:
An interpretive judgement about a Session that cannot be computed deterministically and requires a model pass. Produced by the insight layer, not extraction. Distinct from a Signal.

**Retro**:
A retrospective review over one or more Sessions surfacing what worked and what didn't.
_Avoid_: Report, review, analysis.
