# Codex Interactions are bounded by genuine prompts

Codex writes a genuine `event_msg.user_message` before the first `turn_context` that serves it. A `turn_context` marks one model turn, so a single prompt can have many of them while tools and the Model work towards a response. Codex also emits each per-turn `last_token_usage` more than once, alongside a session-cumulative `total_token_usage`.

The Codex adapter therefore opens an Interaction at each genuine user-message event and absorbs records until the next genuine user message. Injected user-role `response_item` records are not boundaries. The first following `turn_context` supplies the Interaction's working directory and Model. Its `turn_id` is the stable interaction key when present; older rollouts without one use the prompt event's timestamp. An Interaction is stored only when it has attribution, an assistant response, and counted Token usage.

Each `last_token_usage` delta is counted only when the accompanying cumulative `total_token_usage.total_tokens` strictly exceeds the maximum already observed. This uses Codex's monotonic session total as an exact duplicate key. The normalised buckets remain disjoint: fresh input is `input_tokens - cached_input_tokens`, cache reads are `cached_input_tokens`, output is `output_tokens`, and cache writes are null.

## Incremental resume

When a file grows, the adapter resumes from the genuine prompt before the prompt containing the Checkpoint, rather than from a model-turn marker. It also derives the maximum cumulative total before that resume anchor. Re-reading the previous complete Interaction supplies the baseline needed to reject a leading duplicate and rebuilds the Interaction spanning the Checkpoint from its true prompt boundary. Stable interaction keys make those re-reads safe upserts.

## Consequences

- Interaction counts now represent user-initiated work instead of Codex model turns.
- Multi-turn tool loops remain one Interaction with tokens counted once.
- Modern and older rollouts both retain stable identities across re-ingestion.
- Prompts without attribution, an assistant response, or Token usage are excluded.
- Fixtures must follow real Codex record ordering: genuine prompt first, then one or more turn markers.
