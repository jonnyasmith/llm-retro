# LLM Retro

LLM Retro reads the session logs written by the LLM coding Harnesses you run — Claude, Codex, pi and omp — and turns them into behavioural usage metrics: activity over time, the Project split, the Model and Harness mix, and token usage. It answers "how do I work", not "what did it cost": token usage is a first-class metric and monetary cost is deliberately out of scope.

It is single-user, single-machine and local-first: one process serving the UI, the API and the Jobs, no authentication, no cloud, nothing safe to expose beyond localhost.

## Running it

Node 24 or later, with corepack enabled (`corepack enable`) so the pinned pnpm is used.

```bash
pnpm install
```

```bash
pnpm dev
```

For a production build:

```bash
pnpm build
```

```bash
pnpm start
```

The SQLite database is created and migrated on startup, so there is no separate setup or migration step.

## First run

Ingestion is user-triggered from the **Jobs** screen — the app's home page — once per Harness. It is not a daemon and nothing runs on a schedule, so a fresh install shows empty views until you run an ingest; an empty Overview is the expected state, not a bug. Re-running an ingest is safe: each source file is checkpointed and Interactions are stored under a stable key, so nothing is duplicated.

## What lands on disk

- **The database** — `llm-retro.sqlite3` in the app's data directory: `~/Library/Application Support/llm-retro` on macOS, `%APPDATA%\llm-retro` on Windows, `$XDG_DATA_HOME/llm-retro` (default `~/.local/share/llm-retro`) elsewhere. `LLM_RETRO_DATA_DIR` overrides it. This is the whole of the app's state — back it up, or delete it for a clean slate.
- **The Raw archive** — off by default. When enabled on the Settings page it copies untouched source log files into the directory you configure there, organised by Harness, so history survives a Harness pruning or rotating its own logs.

The Harnesses' own log files remain the system of record. The store is derived and rebuildable: deleting it costs you nothing that a fresh ingest cannot reproduce, as long as the source logs are still there.

## Scripts

| Command              | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `pnpm dev`           | Run the app in development                        |
| `pnpm build`         | Build for production                              |
| `pnpm start`         | Run the production build                          |
| `pnpm test`          | Run the test suite                                |
| `pnpm test:browsers` | Download the Chromium build the client tests need |
| `pnpm check`         | Type-check TypeScript and Svelte                  |
| `pnpm lint`          | Prettier check plus ESLint                        |
| `pnpm format`        | Rewrite files with Prettier                       |

The suite runs in two projects from the one `pnpm test` command: server tests under Node, and client tests that render a screen in a real browser. The browser is not installed by `pnpm install` — run `pnpm test:browsers` once after cloning, or the client project fails to launch.

## Documentation

- `docs/adr/` — the decisions behind every non-obvious behaviour in the system. Read here before re-deciding something.
- `docs/agents/domain.md` — the domain glossary; the vocabulary the code and the docs both use.
- `docs/agents/harness-log-formats.md` — where each Harness writes its logs and which fields carry what.
- `docs/agents/coding-standards.md` — the conventions this codebase follows that tooling cannot catch.
- `docs/agents/verification.md` — the commands that gate a change, and the traps in them.
- `docs/agents/code-comments.md` — what belongs in a code comment, and where everything else goes.
- `AGENTS.md` — the instructions an agent working in this repository operates under.
