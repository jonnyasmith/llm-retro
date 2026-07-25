# A Session may span many files; the Checkpoint tracks only the primary one

A Session is one Harness run, but on disk it is not always one file. Claude writes sub-agent activity to sibling `subagents/agent-<id>.jsonl` files alongside the main `<sessionId>.jsonl`, and omp nests sub-agent files too. Those sub-agent files carry tokens that fold into the spawning Interaction's main-vs-sub split (ADR-0001), so ingestion must read them — yet the `Checkpoint` is keyed one row per Session (`harness` + `stableSessionId`) with a single byte offset.

We keep that shape: **the Checkpoint tracks the primary session file only.** Auxiliary files (sub-agent logs) are re-read in full on every ingest and de-duplicated by the Interaction idempotency key (`UNIQUE(sessionId, interaction_key)`), which makes re-folding their tokens a no-op.

## Considered options

- **Per-file checkpoints** (one Checkpoint row per physical file, main and sub alike). More precise resumption and no repeated re-reads, but it generalises the Checkpoint key away from the Session and adds a row per sub-agent file. Rejected as premature: sub-agent files are small relative to the main log, and correctness is already guaranteed by idempotency, not by the checkpoint.

## Consequences

- The Checkpoint stays a per-Session concept, matching the domain glossary and the S2 schema — no change to the store.
- Correctness of re-folded sub-agent tokens rests entirely on the Interaction idempotency key, which therefore must be exact; the checkpoint is a resumption optimisation for the main file only, never a correctness mechanism for auxiliary files.
- The primary file is read twice per ingest: once as a checkpointed slice, for Interaction extraction, and once in full, for the sub-agent token fold whose auxiliary counterpart is already read in full. The full read is safe only because of the same Interaction idempotency key; it does not weaken the Checkpoint, which still bounds every Interaction the run extracts.
- A sub-agent still running when ingest starts has no completed tool_result to correlate it to its spawning Interaction, so it is skipped and folded on a later re-run — never guessed.
- If a Harness ever writes an auxiliary file large enough that wholesale re-reads hurt, per-file checkpoints become worth revisiting; the idempotency-backed model means that change is contained.
