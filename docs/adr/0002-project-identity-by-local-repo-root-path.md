# Project identity is the local repo root path, not the git remote

Work is attributed to a Project (a git repository), and every metric can be sliced by it, so Project identity is baked into aggregates and expensive to change afterwards. We identify a Project by its **local repository root path** — worktrees and subdirectories resolve up to that root — and keep the git remote URL only as a display attribute.

## Considered options

- **Remote URL identity** — would unify two checkouts of the same remote, but fails on local-only experiments (no remote) and forces a fallback. Rejected.
- **Literal working directory** — would fragment one repo into many across worktrees and subdirs. Rejected.

## Consequences

- Deterministic and offline: resolving a `cwd` to its repo root never needs network or a remote to exist, so throwaway local repos — exactly the work a tracker wants to catch — get first-class identity.
- A re-clone of the same repo to a new path becomes a *different* Project. Acceptable because the tool is single-user on one machine; cross-machine unification is a non-goal.
