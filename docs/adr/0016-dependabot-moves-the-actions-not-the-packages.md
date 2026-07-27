# Dependabot moves the Actions, not the packages

`.github/dependabot.yml` configures exactly one ecosystem: `github-actions`.
The `npm` ecosystem — which is to say 19 of this repo's 24 direct dependencies —
is deliberately absent, and present in the file only as a commented block.

Every dependency is pinned to an exact version, which makes builds reproducible
and makes a transitive publish unable to change what installs. The cost of exact
pins is that nothing moves unless something moves it. Dependabot is the usual
answer. It cannot be the answer here yet.

## Dependabot cannot read a pnpm 11 lockfile

This repo is `packageManager: pnpm@11.17.0`. GitHub's supported ecosystems
document pnpm to v10, and [dependabot-core#14794][14794] — "Support PNPM v11" —
is open, with Node.js's own repository blocked on it.

Our `pnpm-lock.yaml` is a single-document `lockfileVersion: '9.0'` file, so it
avoids the loudest failure: the two-document lockfile pnpm 11 writes for a
project using `devEngines` or `configDependencies` is reported as
`dependency_file_not_parseable` outright. What it does not avoid is
[`ERR_PNPM_CACHE_MISSING_AFTER_304`][304] — pnpm 11 sends conditional metadata
requests, Dependabot's caching proxy answers `304` against an empty container
cache, and `pnpm update --lockfile-only` aborts. It is intermittent, and its
symptom is a scheduled run that opens no pull requests and says nothing.

That is the decisive property. A dependency bot that is merely late is
tolerable; one that fails invisibly is worse than no bot, because the repository
looks covered. We would rather have a hole we can see.

## What replaces the missing half

Dependabot's value here was named in #69 as _staying current cheaply_, with
security alerts secondary. The two are separated because only one of them
depends on the broken updater.

- **Security.** Dependabot **alerts** are enabled. They read the dependency
  graph, not the pnpm updater, and the graph parses our lockfile — verified via
  the SBOM endpoint, 359 packages resolved. Dependabot **security updates** stay
  off: they would open pull requests through the same updater that cannot run.
  An alert we act on by hand is the honest shape of this.
- **Currency.** `.github/workflows/dependency-report.yml` runs `pnpm outdated`
  monthly and keeps a single labelled issue current — rewritten in place,
  reopened on drift, closed when the tree catches up. It reports and never
  gates; the gate is `verify`, on pull requests.

The report deliberately does not run `pnpm audit`. Audit reads the same GHSA
database the alerts read, and a second channel repeating the first teaches you
to ignore both.

## Actions are pinned to SHAs, and grouped

The `github-actions` half is unaffected by any of the above and is configured
without reservation: weekly, all four actions in one group, majors included.

The workflows now pin actions to full commit SHAs with a version comment rather
than to `@v7`-style major tags. A major tag is mutable, which is the same hazard
exact pins exist to prevent, applied to code that runs holding a token.
SHA-pinning without automation would ossify immediately, so the pins and the
bot are one decision, not two.

Majors are allowed rather than ignored. An Action major is a runner or Node
runtime bump, not a library migration, and the risk is bounded in a way a
`svelte` or `drizzle-orm` major is not: a broken Action fails `verify` on the
pull request. Ignoring them is how a repository ends up on a runtime GitHub
eventually removes.

Nothing merges itself. The ruleset on `main` already requires a pull request and
a green `verify`, and adding an auto-merge workflow would mean granting
`contents: write` and `pull-requests: write` to a repository whose security
story is that it has almost no attack surface — to save perhaps four clicks a
year.

## Considered options

- **Downgrade to pnpm 10 to fit the supported matrix.** Rejected: it regresses
  the toolchain we actually run — `strictDepBuilds` and `allowBuilds` in
  `pnpm-workspace.yaml` are pnpm 11 shape — to suit a bot.
- **Enable `npm` anyway and accept the flakiness.** Rejected for the reason
  above: the failure is silent, so the cost is not delay but false confidence.
- **Nothing mechanical; run `pnpm outdated` by hand.** Rejected. "When someone
  remembers" is the condition #69 was written to describe.
- **A fresh report issue each month.** Rejected: a recurring notification
  trains you to close it unread. One durable issue is a status surface.

## Consequences

- **This decision has an expiry condition.** It is correct only while [#14794][14794]
  is open. #87 tracks the re-enable and its verification; the `npm` block is
  left commented in `.github/dependabot.yml` so that re-enabling is one edit.
- **Package updates are a human decision until then.** The monthly issue is the
  prompt; applying a bump is manual, verified by `pnpm test`, `check`, `lint`
  and `build` on a pull request like any other change.
- **The monthly report becomes redundant the day the `npm` block goes live**,
  and should be deleted rather than left running as a second channel.
- **A new workflow may not use a floating action tag.** Both existing workflows
  pin SHAs; a tag added later would be silently unmanaged, because Dependabot
  updates whatever it finds without complaining about what it cannot.
- **`.nvmrc` is not managed by anything.** It is not a manifest Dependabot
  reads, and `pnpm outdated` does not look at it. Node major bumps stay a
  deliberate act.

[14794]: https://github.com/dependabot/dependabot-core/issues/14794
[304]: https://github.com/dependabot/dependabot-core/issues/14794#issuecomment-4926643532
