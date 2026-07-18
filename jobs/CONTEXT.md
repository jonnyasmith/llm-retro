# Jobs

Self-describing containers that turn raw Sessions into stored data (extraction) and derive facts from it (analysis and the insight layer). Solution-wide terms (Session, Signal, Inference…) live in the root [`../CONTEXT.md`](../CONTEXT.md).

## Language

**Job**:
A unit of work the tool runs. Extraction Jobs turn raw Sessions into stored data; analysis Jobs derive Signals or other artefacts from stored data. Job types are pluggable so the tool extends over time.

**Turn**:
One user-prompt-then-AI-response exchange within a Session. Derived from the Session's Messages, not stored — a Signal, not a stored entity.

**Course-correction**:
A Turn where the user redirects the AI off a path it was taking, indicating earlier misalignment. An Inference, not a Signal.

**Input-noise waste**:
Wasted Turns traceable to garbled user input (dictation errors, dyslexic typos) causing the AI to misunderstand. An Inference, not a Signal.

**Dumb zone**:
The region of degraded AI quality once a Session's context grows past some token threshold.
