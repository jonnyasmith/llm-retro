# 03 — Sub-agent fold-up (main-vs-sub split)

**Parent:** `.scratch/first-harness-end-to-end/spec.md`

**What to build:** Sub-agent tokens folded into the Interaction that spawned them, retained as a main-vs-sub split, so interaction counts stay honest while token totals stay complete (ADR-0001).

**Blocked by:** 01 (stored Interactions and the ingest loop).

**Status:** ready-for-agent

- [ ] The adapter reads both sub-agent representations: sibling `<sessionId>/subagents/agent-<agentId>.jsonl` files (records flagged `isSidechain:true`, carrying `agentId` + parent `sessionId`) and, for older logs, inline `isSidechain` records in the main file.
- [ ] Attribution is per spawning Interaction: the `Agent` tool-use's tool_result carries the `agentId`, mapping each sub-agent back to the exactly-one Interaction that spawned it.
- [ ] The sub-agent's four token buckets sum into that Interaction's `sub*` columns; the sub-agent's Model is discarded (no sub-model column).
- [ ] Nested sub-agents flatten: the entire descendant subtree's tokens fold into the top-level Interaction's `sub*` bucket; no depth retained.
- [ ] A sub-agent with no completed tool_result at ingest time (still running) is skipped and folded on a later re-run — never guessed.
- [ ] Re-folding on re-run is a no-op (idempotency-safe), since sub-agent files are re-read wholesale.
- [ ] Tested at the ingest-handler seam with fixtures containing separate-file and (optionally) inline sub-agents, including a nested case: assert the main-vs-sub split and that flattening rolls nested tokens to the top-level Interaction.
