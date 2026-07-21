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
	}`;
	document.head.appendChild(style);
}

if (enabled) {
	afterEach(async (ctx) => {
		const storyId = ctx.task?.meta?.storyId as string | undefined;
		if (!storyId) return;
		// A story opts out with `parameters: { visual: { disable: true } }` —
		// for invisible primitives (spacers) that have no stable pixels to diff.
		const story = (ctx as { story?: { parameters?: { visual?: { disable?: boolean } } } }).story;
		if (story?.parameters?.visual?.disable) return;
		freezeMotion();
		// Wait for web fonts to swap in — otherwise a screenshot can race the
		// font load and diff against a fallback glyph (notably monospace text).
		await document.fonts.ready;
		const root =
			document.querySelector('#storybook-root') ?? document.querySelector('#root') ?? document.body;
		await expect(page.elementLocator(root as Element)).toMatchScreenshot(storyId);
	});
}
