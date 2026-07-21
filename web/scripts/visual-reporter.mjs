// Emits visual-results.json — the manifest the Storybook "Visual tests" panel
// reads. Self-gates on VITE_VISUAL so ordinary `storybook:test` runs write
// nothing. Status is derived from each story test's result; screenshot paths
// follow Vitest's default toMatchScreenshot templates (see docs/adr/0007-*).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const BROWSER = 'chromium';
const platform = process.platform; // 'linux' in CI/Docker, 'darwin' locally

function classify(state, errors) {
	if (state === 'passed') return 'unchanged';
	if (state !== 'failed') return null; // skipped/pending — not a visual verdict
	const message = (errors ?? []).map((e) => e?.message ?? '').join('\n');
	if (/No existing reference|new one was created/i.test(message)) return 'new';
	if (/toMatchScreenshot|screenshot|does not match/i.test(message)) return 'changed';
	return 'error'; // failed for a non-visual reason (e.g. a11y/play)
}

function screenshotPaths(moduleId, storyId) {
	const rel = path.relative(process.cwd(), moduleId);
	const dir = path.dirname(rel);
	const file = path.basename(rel);
	const name = `${storyId}-${BROWSER}-${platform}.png`;
	return {
		reference: path.join(dir, '__screenshots__', file, name),
		diff: path.join('.vitest-attachments', dir, file, name)
	};
}

export default class VisualReporter {
	async onTestRunEnd(testModules) {
		if (!process.env.VITE_VISUAL) return;
		const stories = [];
		for (const mod of testModules) {
			for (const test of mod.children.allTests()) {
				const meta = test.meta();
				const storyId = meta?.storyId;
				if (!storyId) continue;
				const result = test.result();
				const status = classify(result.state, result.errors);
				if (!status) continue;
				stories.push({
					storyId,
					name: test.fullName,
					file: path.relative(process.cwd(), mod.moduleId),
					status,
					...screenshotPaths(mod.moduleId, storyId)
				});
			}
		}
		stories.sort((a, b) => a.storyId.localeCompare(b.storyId));
		const summary = stories.reduce(
			(acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }),
			{}
		);
		await writeFile(
			path.join(process.cwd(), 'visual-results.json'),
			JSON.stringify(
				{ ranAt: new Date().toISOString(), platform, browser: BROWSER, summary, stories },
				null,
				2
			)
		);
	}
}
