# Solution Wide Instructions

## Routing — read only what the task needs, when it needs it

### This context

- Solution-wide vocabulary → docs/agents/domain.md
- System-wide decisions → docs/adr/
- On-disk log formats the Harness adapters parse → docs/agents/harness-log-formats.md
- Issue tracker (issues + specs as GitHub issues via gh) → docs/agents/issue-tracker.md
- Triage labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix) → docs/agents/triage-labels.md

## Verify before claiming a change works

Run the narrowest command that covers the change, then the full gate before handing back:

| Command                                | Covers                                            |
| -------------------------------------- | ------------------------------------------------- |
| `pnpm test --project server`           | Server tests only (Node) — fastest useful signal  |
| `pnpm test --project client`           | Client tests only (real Chromium, headless)       |
| `pnpm test <path-fragment>`            | One file or directory across both projects        |
| `pnpm check`                           | TypeScript and Svelte types                       |
| `pnpm lint`                            | Prettier check plus ESLint (`pnpm format` to fix) |
| `pnpm test && pnpm check && pnpm lint` | The full gate                                     |

Do not pass `--` before vitest flags: `pnpm test -- --project server` silently runs every project.

The client project needs a Chromium build that `pnpm install` does not fetch — run `pnpm test:browsers` once per clone or the project fails to launch.

## Comment only what the code cannot say

A code comment explains non-obvious _local_ intent — why this line is surprising, a constraint the reader cannot infer from the code itself. It is not where architecture, rationale, or how a feature works across files lives; that belongs in ADRs and the agent guides, which outlast any one file.Never narrate a feature's existence in files that merely participate in it, never restate what the code already says, and never leave comments that only made sense while writing this change (the plan, the migration, the "now we also…"). If a fact matters project-wide, put it in its durable home and let the code stay quiet.
