import { afterEach, expect } from 'vitest';
import { page } from 'vitest/browser';

// Visual-regression capture, gated so ordinary `storybook:test` runs stay fast
// and never diff pixels. Only when VITE_VISUAL=1 does every story additionally
// get screenshotted and compared against its committed baseline. Rationale and
// the CI/Docker baseline contract live in docs/adr/0007-*.
const enabled = Boolean(import.meta.env?.VITE_VISUAL);

// Freeze anything that would make a screenshot non-deterministic: animations,
// transitions, the text caret. Injected once; deterministic frames are the
// whole point of pixel diffing.
const FREEZE_STYLE_ID = 'visual-freeze';
function freezeMotion() {
	if (document.getElementById(FREEZE_STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = FREEZE_STYLE_ID;
	style.textContent = `*, *::before, *::after {
		animation-duration: 0s !important;
		animation-delay: 0s !important;
		transition-duration: 0s !important;
		transition-delay: 0s !important;
		caret-color: transparent !important;
		/* Force greyscale AA: LCD sub-pixel text rendering is non-deterministic
		   run-to-run in headless Chromium and was flaking text-heavy stories. */
		-webkit-font-smoothing: antialiased !important;
		text-rendering: geometricPrecision !important;
	}`;
	document.head.appendChild(style);
}

if (enabled) {
	afterEach(async (ctx) => {
		const storyId = ctx.task?.meta?.storyId as string | undefined;
		if (!storyId) return;
		// Per-story visual controls:
		//   disable  — skip capture (invisible primitives with no stable pixels)
		//   settleMs — wait before capture (async/canvas renders like ECharts that
		//              are not painted yet when the story's run resolves)
		const story = (
			ctx as { story?: { parameters?: { visual?: { disable?: boolean; settleMs?: number } } } }
		).story;
		const visual = story?.parameters?.visual;
		if (visual?.disable) return;
		freezeMotion();
		// Wait for web fonts to swap in — otherwise a screenshot can race the
		// font load and diff against a fallback glyph (notably monospace text).
		await document.fonts.ready;
		if (visual?.settleMs) await new Promise((resolve) => setTimeout(resolve, visual.settleMs));
		const root =
			document.querySelector('#storybook-root') ?? document.querySelector('#root') ?? document.body;
		await expect(page.elementLocator(root as Element)).toMatchScreenshot(storyId);
	});
}
