# Normalised-only store, with a configurable raw-file archive

The north star is behavioural metrics, not a log archive. The SQLite store therefore holds only normalised `Interaction`/`Session`/`Project` rows plus `Checkpoint`s — **no prompt or response text**. The Harnesses' raw JSONL files remain the system of record on disk; changing a derivation is "reset checkpoints, re-ingest," and a parser can always be debugged against the files directly.

## Consequences

- The store stays small and query-fast, and re-derivation never needs a text warehouse duplicating what the log files already are.
- Prompt-level features (e.g. analysing weak inputs to improve as an engineer) are **deferred, not blocked** — they can be added later by re-ingesting the raw files with a text-capturing parser.
- The only thing that would truly foreclose that option is a Harness rotating or pruning old logs (Codex already has an `archived_sessions/` dir). To protect it, ingestion **archives the untouched raw files** into an app-owned directory, kept separate from the query store. The archive is **configurable** (on/off + path) so the disk cost is opt-out.

## Raw archive layout

An archived file lands at `<root>/<harness>/<base64url of the source's filesystem root>/<path relative to that root>`. The layout is a contract rather than an implementation detail: "reset checkpoints, re-ingest" is only recoverable if a human can find the file a Session came from, and the Harness segment above a mirrored source path is what makes that possible by inspection.

The encoded filesystem-root segment is load-bearing. Log sources are user-configurable and a Harness may be pinned to several, so two roots can hold identically named files at identical relative paths; without the segment they would collide in the archive and one would silently overwrite the other. It is encoded rather than mirrored literally because a filesystem root is not a legal path segment.

## Archiving precedes every parse

A source file is archived before any Harness-specific code reads its bytes — before Session identification, not merely before the slice parse. A file whose first record is malformed is the file this decision most exists to protect, and it is the file a Harness is most likely to have written badly and later prune. Ordering identification first, so as not to archive a file that turns out to be junk, inverts the point of the archive.

An archive failure fails the Ingestion run. A hedge that fails quietly is worse than no hedge, because the user believes they hold a copy they do not; Ingestion is idempotent and re-runnable, so the cost of stopping is a retry rather than data.
