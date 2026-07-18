# Jobs

Self-describing containers that turn raw Sessions into stored data (extraction) and derive facts from it (analysis and the insight layer).

## Language

**Job**:
A unit of work the tool runs. Extraction Jobs turn raw Sessions into stored data; analysis Jobs derive Signals or other artefacts from stored data. Job types are pluggable so the tool extends over time.

**Signal**:
A structured fact mechanically derived from one normalised Session — exact, cheap, re-runnable, no model call. E.g. turn count, tokens, model-per-phase, subagent usage. Signals feed views directly.
_Avoid_: Metric, feature, datapoint.

**Turn**:
One user-prompt-then-AI-response exchange within a Session. Derived from the Session's Messages, not stored — a Signal, not a stored entity.

**Inference**:
An interpretive judgement about a Session that cannot be computed deterministically and requires a model pass — e.g. course-corrections, input-noise waste, the dumb-zone threshold. Produced by the insight layer, not extraction. Distinct from a Signal.

**Course-correction**:
A Turn where the user redirects the AI off a path it was taking, indicating earlier misalignment. An Inference, not a Signal.

**Input-noise waste**:
Wasted Turns traceable to garbled user input (dictation errors, dyslexic typos) causing the AI to misunderstand. An Inference, not a Signal.

**Dumb zone**:
The region of degraded AI quality once a Session's context grows past some token threshold.
