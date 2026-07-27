# Verifying a change

Run the narrowest command that covers the change while you work, then the full gate before handing back.

| Command                                | Covers                                            |
| -------------------------------------- | ------------------------------------------------- |
| `pnpm test --project server`           | Server tests only (Node) — fastest useful signal  |
| `pnpm test --project client`           | Client tests only (real Chromium, headless)       |
| `pnpm test <path-fragment>`            | One file or directory across both projects        |
| `pnpm check`                           | TypeScript and Svelte types                       |
| `pnpm lint`                            | Prettier check plus ESLint (`pnpm format` to fix) |
| `pnpm test && pnpm check && pnpm lint` | The full gate                                     |

`pnpm test` runs two projects: `server` under Node, and `client` rendering components in headless Chromium. Naming one with `--project` is the difference between a second and the whole suite.

## Traps

- **Do not pass `--` before vitest flags.** `pnpm test -- --project server` runs every project — the filter is silently ignored, and the run still passes, so it looks like the narrow command worked.
- **The client project needs a browser binary `pnpm install` does not fetch.** Run `pnpm test:browsers` once per clone, or the project fails to launch.

## What counts as verified

A green command only proves what it exercised. Claim the specific thing you ran, and say what remains unverified — a passing server project says nothing about a screen, and a type-check says nothing about behaviour.
