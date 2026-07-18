# Database

The store of record: the Normalised Session Model and its migrations — the shape every downstream context reads.

## Language

**Session**:
One recorded conversation between the user and an AI coding tool, from a single transcript on disk.
_Avoid_: Conversation, chat, thread.

**Tool**:
One of the AI coding products the user drives: Claude (Code), Codex, or pi. Each stores Sessions in its own format.
_Avoid_: Agent, assistant, provider.

**Message**:
One record in a Session's ordered stream — a user prompt, an AI response, or a tool result. Sessions are a flat sequence of Messages.
_Avoid_: Record, event, entry.

**Normalised Session Model**:
The unified representation all three Tools' transcripts are mapped into, so downstream jobs are tool-agnostic.
_Avoid_: Schema, canonical format.
