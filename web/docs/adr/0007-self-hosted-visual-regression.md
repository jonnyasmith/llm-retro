# Self-hosted visual regression, no external service

**Status:** accepted — extends [ADR-0005](0005-storybook-canonical-workbench.md) (Storybook is the canonical UI workbench)

Visual regression testing runs entirely in-repo on Vitest's browser-mode `toMatchScreenshot`. We do not
use Chromatic or any hosted snapshot service. Every story is screenshotted and pixel-compared against a
committed baseline; git is the baseline store and pull requests are the review surface.

Screenshots are captured by piggybacking on `@storybook/addon-vitest`: each story is already mounted as a
browser test, so a gated `afterEach` (`.storybook/vitest.visual-setup.ts`) screenshots the mounted root.
This reuses Storybook's own rendering rather than re-implementing portable-story rendering.

## The baseline environment is fixed, and it is Linux

Pixel diffing is only meaningful when the rendering environment is identical between the baseline and the
comparison. Fonts and anti-aliasing differ across operating systems, so a baseline captured on a developer's
macOS machine would false-positive everywhere else.

Therefore baselines are **only ever produced in one environment**: the pinned Playwright Linux image
(`mcr.microsoft.com/playwright:v1.60.0-noble`, kept in lockstep with the installed `playwright` version).
`scripts/visual.mjs` runs the suite inside that image locally; CI (`.github/workflows/visual.yml`) runs the
same image. Committed baselines carry a `-chromium-linux` suffix; macOS `-darwin` captures are throwaway and
git-ignored. A developer regenerates baselines with `pnpm test:visual:update` (Docker) and commits the PNGs.

## Contract

- **Gating** — capture is opt-in via `VITE_VISUAL=1`; ordinary `pnpm storybook:test` never diffs pixels.
- **Determinism** — before each capture, animations/transitions/caret are frozen and `document.fonts.ready`
  is awaited (a font-load race otherwise flakes monospace text).
- **Opt-out** — a story with `parameters: { visual: { disable: true } }` is not screenshotted, for invisible
  primitives (e.g. spacers) that have no stable pixels.
- **New/changed baseline fails the run** — a missing or differing baseline is a red test, so CI gates on it
  and a human reviews the diff before committing the update. This is Chromatic's accept-changes loop without
  the service.
- **References** are committed under `__screenshots__/`; per-run `actual`/`diff` images (`.vitest-attachments/`)
  and the panel manifest (`visual-results.json`) are throwaway and git-ignored.

## Review surface: a local "Visual tests" panel

A local Storybook addon (`.storybook/visual/`) adds a "Visual tests" panel mirroring Chromatic's: it reads a
manifest emitted by a Vitest reporter (`scripts/visual-reporter.mjs`) and shows per-story status and baseline/diff
images, with a "Run tests" button. Because a manager panel cannot spawn a test process, it calls a dev-only
server bridge (`viteFinal` middleware) that serves screenshots and triggers `scripts/visual.mjs`. The panel is
a convenience review surface; the authoritative gate is CI.

## Out of scope

Cross-browser and multi-viewport matrices (only Chromium/Linux today), cloud parallelisation, and a hosted
history of past snapshots — the things a paid service sells — are deliberately not reproduced.
