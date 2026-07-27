# Comment only what the code cannot say

A code comment explains non-obvious _local_ intent — why this line is surprising, a constraint the reader cannot infer from the code itself.

It is not where architecture, rationale, or how a feature works across files lives; that belongs in ADRs and the agent guides, which outlast any one file.

## Never

- **Narrate a feature's existence** in files that merely participate in it.
- **Restate what the code already says.**
- **Leave comments that only made sense while writing the change** — the plan, the migration, the "now we also…".

## Where a durable fact goes instead

| Fact                             | Home                                 |
| -------------------------------- | ------------------------------------ |
| Why the system decided something | `docs/adr/`                          |
| What a domain term means         | `docs/agents/domain.md`              |
| How a Harness writes its logs    | `docs/agents/harness-log-formats.md` |
| How to prove a change works      | `docs/agents/verification.md`        |

If a fact matters project-wide, put it in its durable home and let the code stay quiet.
