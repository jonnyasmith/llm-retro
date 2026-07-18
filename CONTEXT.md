# LLM Retro

A tool for retrospectively reviewing the user's own AI-coding sessions (Claude, Codex, pi) to learn what works and what doesn't over time. Ingests local session transcripts, extracts structured signals, and serves both quantitative metrics and emergent qualitative insights.

## Language

**Session**:
One recorded conversation between the user and an AI coding tool, from a single transcript on disk.
_Avoid_: Conversation, chat, thread.

**Tool**:
One of the AI coding products the user drives: Claude (Code), Codex, or pi. Each stores Sessions in its own format.
_Avoid_: Agent, assistant, provider.

**Normalised Session Model**:
The unified representation all three Tools' transcripts are mapped into, so downstream jobs are tool-agnostic.
_Avoid_: Schema, canonical format.

**Turn**:
One user-prompt-then-AI-response exchange within a Session.

**Message**:
One record in a Session's ordered stream — a user prompt, an AI response, or a tool result. Sessions are a flat sequence of Messages; a Turn is derived from them, not stored.
_Avoid_: Record, event, entry.

**Signal**:
A structured fact extracted from a Session that a view renders — e.g. turn count, corrections, subagent usage, tokens, model, course-corrections, input-noise waste.
_Avoid_: Metric, feature, datapoint.

**Course-correction**:
A Turn where the user redirects the AI off a path it was taking, indicating earlier misalignment.

**Input-noise waste**:
Wasted Turns traceable to garbled user input (dictation errors, dyslexic typos) causing the AI to misunderstand.

**Dumb zone**:
The region of degraded AI quality once a Session's context grows past some token threshold.

**Retro**:
A retrospective review over one or more Sessions surfacing what worked and what didn't.
_Avoid_: Report, review, analysis.

**Job**:
A unit of work the tool runs. Extraction Jobs turn raw Sessions into stored data; analysis Jobs derive Signals or other artefacts from stored data. Job types are pluggable so the tool extends over time.

**Viewer**:
A consumer that renders finalised data. v1 has two: a metrics view and a retro/insights view — two views over the same extracted data.
