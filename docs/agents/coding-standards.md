# Coding standards

The conventions this codebase follows consistently that neither Prettier, ESLint nor `tsc` can catch. Formatting and type rules are tooling's job — `pnpm lint` and `pnpm check` are the authority there, and nothing about them is repeated here.

Every rule below holds at two or more sites today. A reviewer may cite these against a diff; a deviation is a finding, not a matter of taste. This file is not the whole of what binds a change — the decisions in `docs/adr/` bind code too, and are not summarised here.

## Layering and imports

- **Import `bootstrap` only from a route file.** `+page.server.ts` and `+server.ts` are its sole importers; they pass `Database` down as a plain parameter, so server modules take the store as an argument rather than reaching for the singleton.
- **Put every type that crosses the client/server line in a `contracts.ts` beside its feature.** `$lib/jobs/contracts.ts`, `$lib/settings/contracts.ts`. Nothing outside a route or a server test imports `$lib/server`.
- **Inject the one effectful step as an exported function type.** A rune module declares `export type TriggerIngest = () => Promise<JobTriggerPayload>` and receives it, rather than importing the client module — that is what lets a test drive it without a mocking library.

## Server

- **Signal failure by throwing a named `Error` subclass; let the endpoint map it to a status.** There is no `Result` type and no error-shaped return value. `InvalidSettingsError` → 400, `IngestionActiveError` → 409, anything unrecognised rethrows.
- **Name the caught binding `cause`, narrow it, and rethrow what you do not own.** Every one of the 20 `catch` blocks in `src/` does this; there are no `catch (error)` or `catch (e)` sites. Narrowing is `instanceof` or a named predicate (`isMissingPath`, `isNotGitRepository`).
- **Spell wire payloads `snake_case` and everything in-app `camelCase`, translating at the endpoint.** `JobTriggerPayload.correlation_id` sits beside `JobRunSummary.correlationId` in the same contracts file, and the SSE endpoint does the mapping.

## Client and components

- **Mutate through a JSON `/api/*` endpoint followed by `invalidateAll()`.** There is no form action anywhere in `src/`.
- **Type props as an inline object literal on `$props()`; use the generated `PageProps`/`LayoutProps` in routes.** No `interface Props` exists in the codebase.
- **Seed editable state from props through `untrack`.** A form that owns a draft copies the prop once — `let timezone = $state(untrack(() => settings.timezone))` — so a reload does not stamp on what the user is typing.

## Naming and vocabulary

- **`.ts` modules are kebab-case, `.svelte` components are PascalCase.**
- **Capitalise the glossary nouns — Session, Interaction, Harness, Job run, Store — in comments, JSDoc and test names.** `docs/agents/domain.md` owns the definitions; capitalisation is how prose signals it means the domain term and not the everyday word.

## Tests

- **Hand-roll doubles into a shared `*-fixture.ts`.** `job-run-connection-fixture.ts`, `ingest-fixture.ts`, `render-fixture.ts`. `vi.fn`/`vi.mock` is reserved for globals and framework modules — `$app/navigation`, `fetch`, `$lib/server/bootstrap` in a route test.
- **One `describe` per exported symbol, and `it` names in the third person describing behaviour.** No arrange/act/assert comments. `expect.requireAssertions` is on, so an assertion-free test fails rather than passes silently.

## Not settled

Do not cite these against a diff — the codebase disagrees with itself, so either choice is defensible until a decision is recorded:

- **Route CSS placement.** Every screen scopes styles in `<style>`; `routes/settings/+page.svelte` also imports `./settings.css`.
- **Endpoint test location.** `api/settings/server.test.ts` sits beside its endpoint; `api/jobs/ingest/ingest-trigger.test.ts` sits a directory above the `[harness]/+server.ts` it exercises.

There is **no** Primitive/Presentational/Container layering in this repo. `src/lib/components/` is flat, and components import domain types directly.
