# Project identity is the local repo root path, not the git remote

Work is attributed to a Project (a git repository), and every metric can be sliced by it, so Project identity is baked into aggregates and expensive to change afterwards. We identify a Project by its **local repository root path** — worktrees and subdirectories resolve up to that root — and keep the git remote URL only as a display attribute.

## Considered options

- **Remote URL identity** — would unify two checkouts of the same remote, but fails on local-only experiments (no remote) and forces a fallback. Rejected.
- **Literal working directory** — would fragment one repo into many across worktrees and subdirs. Rejected.

## Consequences

- Deterministic and offline: resolving a `cwd` to its repo root never needs network or a remote to exist, so throwaway local repos — exactly the work a tracker wants to catch — get first-class identity.
- A re-clone of the same repo to a new path becomes a _different_ Project. Acceptable because the tool is single-user on one machine; cross-machine unification is a non-goal.
- Resolution runs against the `cwd` recorded in the log, which is historical and may no longer exist (repo deleted, worktree pruned). When the `cwd` cannot be resolved to a repo root, the Interaction is **kept** and identified by its **literal recorded `cwd`** (remote null), never dropped — attribution of real activity beats identity purity. A since-deleted worktree therefore cannot collapse to its parent and fragments into its own Project; accepted as a rare, degraded case consistent with the path-based-fragmentation tradeoff above.
- **A Session may span multiple Projects.** Codex records a `cwd` per turn, so one log file can move between repositories mid-session. Project attribution is authoritative at the **Interaction** (each carries its own resolved `cwd`); `session.projectId` is therefore **nullable** and derived from all stored Interactions: it is the sole common Project only when every Interaction agrees, otherwise null means "heterogeneous — see the Interactions". Forcing a single representative Project onto such a Session would silently lie on any Session-level view.
