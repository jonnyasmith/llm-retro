# 02 — Project resolution: worktree/clone collapse

**Parent:** `.scratch/first-harness-end-to-end/spec.md`

**What to build:** Real Project identity behind ticket 01's resolver seam, so worktrees and subdirectories collapse to their parent repository and every Interaction attributes to exactly one Project — the "what I was working on" dimension (ADR-0002).

**Blocked by:** 01 (the resolver seam and stored Interactions).

**Status:** ready-for-agent

- [ ] The git-backed resolver implementation replaces the literal-cwd stub behind 01's `cwd → { rootPath, gitRemoteUrl }` seam.
- [ ] `rootPath` = the parent directory of the absolute `git --git-common-dir` for the cwd — one rule that collapses both linked worktrees (to the main clone) and plain clones (to their own root).
- [ ] `gitRemoteUrl` = the `origin` remote URL, or null when absent (local-only repos are common).
- [ ] A cwd that cannot be resolved to a repo (deleted, pruned, or non-git) is kept and attributed to its literal path with null remote — never dropped.
- [ ] Resolution is memoised per distinct cwd within a job run.
- [ ] `Project` rows are idempotent on `UNIQUE(rootPath)`; `session.projectId` takes the session's opening cwd.
- [ ] A narrow integration test exercises the real resolver over throwaway `git init` / `git worktree add` directories, asserting worktree + plain-clone collapse to the same-or-correct root and the unresolvable-path fallback.
