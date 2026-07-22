# Normalised-only store, with a configurable raw-file archive

The north star is behavioural metrics, not a log archive. The SQLite store therefore holds only normalised `Interaction`/`Session`/`Project` rows plus `Checkpoint`s — **no prompt or response text**. The Harnesses' raw JSONL files remain the system of record on disk; changing a derivation is "reset checkpoints, re-ingest," and a parser can always be debugged against the files directly.

## Consequences

- The store stays small and query-fast, and re-derivation never needs a text warehouse duplicating what the log files already are.
- Prompt-level features (e.g. analysing weak inputs to improve as an engineer) are **deferred, not blocked** — they can be added later by re-ingesting the raw files with a text-capturing parser.
- The only thing that would truly foreclose that option is a Harness rotating or pruning old logs (Codex already has an `archived_sessions/` dir). To protect it, ingestion **archives the untouched raw files** into an app-owned directory, kept separate from the query store. The archive is **configurable** (on/off + path) so the disk cost is opt-out.
