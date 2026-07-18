# Instructions

## Repository invariants

- TODO

## Agent skills

Use progressive disclosure: read only the guidance relevant to the current task, immediately before it is needed.

- **Domain docs:** This repository uses the single-context domain documentation layout. See `docs/agents/domain.md`.
- **Planning:** When creating or reviewing an implementation plan (not the actual implement phase), follow `docs/agents/planning.md`.
- **Issue tracker:** Issues and PRDs are tracked in GitHub Issues for this repository. See `docs/agents/issue-tracker.md`.
- **Prototyping:** Build throwaway UI prototypes as dev-only routes under `/prototype`. See `docs/agents/prototyping.md`.
- **Triage labels:** Triage uses the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels. See `docs/agents/triage-labels.md`.

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
