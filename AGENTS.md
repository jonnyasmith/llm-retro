# Solution Wide Instructions

## Routing — read only what the task needs, when it needs it

### Working targets

- Working on the store of record — schema, migrations, seed data → db/AGENTS.md
- Working on the web app or any UI/frontend change → web/AGENTS.md

### This context

- Solution-wide vocabulary → docs/agents/domain.md
- System-wide decisions → docs/adr/
- Issue tracker (issues + specs as markdown under .scratch/) → docs/agents/issue-tracker.md
- Triage labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix) → docs/agents/triage-labels.md

## Comment only what the code cannot say

A code comment explains non-obvious _local_ intent — why this line is surprising, a constraint the reader cannot infer from the code itself. It is not where architecture, rationale, or how a feature works across files lives; that belongs in ADRs and the agent guides, which outlast any one file.Never narrate a feature's existence in files that merely participate in it, never restate what the code already says, and never leave comments that only made sense while writing this change (the plan, the migration, the "now we also…"). If a fact matters project-wide, put it in its durable home and let the code stay quiet.

## Final review loop

Before declaring work complete, perform and report these steps in order:

1. **Re-read:** Compare the original request with the completed changes.
2. **Critique:** Check correctness, completeness, stale assumptions, unintended changes, and policy violations.
3. **Rectify:** Resolve every issue found during critique.
4. **Verify:** Run the narrowest meaningful tests, linters, or compiler checks for the final state.
5. **Report:** Summarise what changed, what was verified and how, and anything that remains unverified.

## Git Commit Protocol

If the changes successfully pass verification and are inside a repository, automatically stage and commit them.

- **Standard:** Follow the Conventional Commits v1.0.0 specification exactly.
- **Language:** Use UK/GB English spelling throughout.
- **Output:** Generate the raw commit message only — do not wrap it in markdown code blocks, and do not include any introductory or trailing commentary.
