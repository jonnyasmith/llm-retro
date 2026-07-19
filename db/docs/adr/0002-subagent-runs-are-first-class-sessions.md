# Sub-agent runs are first-class Sessions

**Status:** accepted

A sub-agent run is modelled as its own **Session** (the identical model), tagged `kind: subagent` with a `parent_session_id` and `parent_tool_call_id` linking it to the spawning `Task`/`subagent` tool call. Primary runs are `kind: primary` (Codex is always primary — it has no native sub-agent concept).

## Considered Options

- **Embed sub-agent Messages inline in the parent Session**, or **nest them under the spawning tool call.** Rejected: every analysis Job would then need bespoke recursion to reach sub-agent content, and the three Tools represent sub-agents three different ways (Claude sidechain files, pi `subagent` sessions, Codex none) — an embedded or nested shape would hard-code one Tool's structure into the model.

## Consequences

- Every Signal and Inference Job works on sub-agents for free, because a sub-agent is just a Session; the subagent-usage Signal rolls child token cost up the tree via the parent link, absolute and as a share of the whole tree.
- Claude's parent link is reconstructed from the file-tree join at ingest; **dangling links are tolerated** (pi retains almost no sub-agent files on disk; Codex has none). The link is best-effort, never a hard foreign key that could cause a Session to be dropped.
- Sessions remain uniquely keyed `(tool, id)` ([ADR-0001](0001-normalised-session-model-lossless-core-plus-raw.md)); `kind` and the parent link are ordinary nullable core fields.

Decided in [#3](https://github.com/jonnyasmith/llm-retro/issues/3).
