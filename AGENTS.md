# Instructions

## Repository invariants

- Keep this file's summaries aligned with their referenced guidance under `docs/agents/`.

## Agent skills

- **Issue tracker:** Issues and PRDs are tracked in GitHub Issues for this repository. See `docs/agents/issue-tracker.md`.
- **Triage labels:** Triage uses the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.
- **Domain docs:** This repository uses the single-context domain documentation layout. See `docs/agents/domain.md`.
- **Planning:** When creating or reviewing an implementation plan, follow `docs/agents/planning.md`.

## Git Commit Protocol

If the changes successfully pass verification and are inside a repository, automatically stage and commit them.

- **Standard:** Follow the Conventional Commits v1.0.0 specification exactly.
- **Language:** Use UK/GB English spelling throughout.
- **Output:** Generate the raw commit message only — do not wrap it in markdown code blocks, and do not include any introductory or trailing commentary.

## Final review loop

Before declaring work complete, perform and report these steps in order:

1. **Re-read:** Compare the original request with the completed changes.
2. **Critique:** Check correctness, completeness, stale assumptions, unintended changes, and policy violations.
3. **Rectify:** Resolve every issue found during critique.
4. **Verify:** Run the narrowest meaningful tests, linters, or compiler checks for the final state.
5. **Report:** Summarise what changed, what was verified and how, and anything that remains unverified.
