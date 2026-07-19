# Database

The store of record: the Normalised Session Model and its migrations — the shape every downstream context reads. Solution-wide terms (Session, Tool, Signal…) live in the root [`domain.md`](../../../docs/agents/domain.md).

## Language

**Normalised Session Model**:
The unified representation all three Tools' transcripts are mapped into, so downstream jobs are tool-agnostic.
_Avoid_: Schema, canonical format.

**Message**:
One record in a Session's ordered stream — a user prompt, an AI response, or a tool result. A Session is a flat sequence of Messages.
_Avoid_: Record, event, entry.
