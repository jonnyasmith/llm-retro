# Prettier formats the tree by default

`pnpm lint` runs `prettier --check .` over everything, and `.prettierignore`
names the exceptions. It previously ran an allowlist of six patterns — the one
written when the repository was created and never revised since — which is why
26 Markdown files and 4 YAML files, including every ADR and every document
`AGENTS.md` routes an agent to, were never formatted and never checked.

An allowlist makes coverage a thing someone must remember. Adding a file type
meant editing the same glob string in two scripts, so the default for anything
new was silently _unformatted_, and nothing reported the gap. A denylist
inverts that: the next `.css`, `.toml` or `.json` to land is covered on
arrival, and dropping something out of scope is a deliberate line in a file
whose whole purpose is to say what is out of scope.

## `.prettierignore` repeats `.gitignore` on purpose

Prettier does not read `.gitignore`. Ignoring only `node_modules` by default,
it would walk `coverage/`, `__screenshots__/`, `.vitest-attachments/` and a
local `worktree.yaml` whenever one exists — turning `pnpm lint` red on files
no one wrote, on some machines and not others, depending on what was run last.

The artifact entries are therefore duplicated into `.prettierignore` rather
than chained in with `--ignore-path .gitignore --ignore-path .prettierignore`.
Chaining removes the duplication at the cost of splitting the answer to "what
is formatted here?" across two files with different purposes, and of letting a
`.gitignore` edit quietly change formatting scope. The duplicated list is four
lines that change roughly never, and `.prettierignore` stays readable on its
own.

The copy is deliberately partial. `.gitignore` also hides `.env` files and
`*.sqlite*`, and neither is repeated here: Prettier infers no parser for
either, so it skips them whether or not they are listed. An ignore line for
them would read as load-bearing and do nothing.

## Consequences

- **Markdown emphasis is `_text_`, not `*text*`.** Prettier emits the
  CommonMark-preferred delimiter and has no option for the other one, so 12
  files were rewritten to match — as their own commit, immediately ahead of
  this switch, to keep the two diffs legible. It is not a house style anyone
  chose and it is not worth reverting by hand; the formatter owns it.
- **`proseWrap` stays at its default, `preserve`.** ADRs here disagree about
  line breaks — some hard-wrap near 80 columns, some run a paragraph per line —
  and `preserve` leaves both alone. Setting `always` would reflow all 26
  Markdown files and take the choice away from the author; the default keeps
  prose diffs shaped the way the document was written.
- **`drizzle/meta/*.json` is still formatted, though drizzle-kit generates it.**
  Its output conforms today, and formatted snapshots are what makes a migration
  reviewable. If a drizzle-kit upgrade ever drifts, `pnpm format` is the fix —
  ignoring generated output in advance would only hide the drift.
- **Nothing enforces this before CI.** No pre-commit hook, and no formatter
  settings in `.vscode/settings.json`, which holds a shared spelling dictionary
  and should not start assuming an editor or an extension. `verify.yml` is the
  single authority, and `pnpm format` is the one-command fix.
