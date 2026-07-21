// Dev-server bridge for the "Visual tests" panel. The panel runs in the browser
// and cannot spawn a test process, so — exactly as Chromatic's panel calls its
// cloud — ours calls these local endpoints instead:
//
//   GET  /__visual/results        latest manifest + whether a run is in flight
//   GET  /__visual/image?path=…   stream a reference or diff PNG
//   POST /__visual/run            kick off `scripts/visual.mjs run` (Docker)
//
// Only mounted in Storybook dev; never part of a production build.
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const run = { active: false, startedAt: 0, lastExit: null as number | null };

// Only PNGs, and only from the two directories screenshots ever live in — no
// path traversal out of the repo.
function safeImagePath(query: string | null): string | null {
	if (!query) return null;
	const abs = path.resolve(webDir, query);
	const inScreenshots = abs.includes(`${path.sep}__screenshots__${path.sep}`);
	const inAttachments = abs.startsWith(path.join(webDir, '.vitest-attachments') + path.sep);
	if ((!inScreenshots && !inAttachments) || !abs.startsWith(webDir) || !abs.endsWith('.png'))
		return null;
	return abs;
}

export function visualMiddleware(): Plugin {
	return {
		name: 'llm-retro-visual-panel',
		configureServer(server) {
			server.middlewares.use('/__visual/results', async (_req, res) => {
				let results: unknown = null;
				try {
					results = JSON.parse(await readFile(path.join(webDir, 'visual-results.json'), 'utf8'));
				} catch {
					// no run yet
				}
				res.setHeader('content-type', 'application/json');
				res.end(JSON.stringify({ running: run.active, lastExit: run.lastExit, results }));
			});

			server.middlewares.use('/__visual/image', async (req, res) => {
				const query = new URL(req.url ?? '', 'http://x').searchParams.get('path');
				const abs = safeImagePath(query);
				if (!abs) {
					res.statusCode = 400;
					return res.end('bad path');
				}
				try {
					await stat(abs);
				} catch {
					res.statusCode = 404;
					return res.end('not found');
				}
				res.setHeader('content-type', 'image/png');
				res.setHeader('cache-control', 'no-store');
				createReadStream(abs).pipe(res);
			});

			server.middlewares.use('/__visual/run', (req, res) => {
				if (req.method !== 'POST') {
					res.statusCode = 405;
					return res.end();
				}
				if (run.active) {
					res.statusCode = 409;
					return res.end(JSON.stringify({ running: true }));
				}
				run.active = true;
				run.startedAt = Date.now();
				run.lastExit = null;
				const child = spawn('node', ['scripts/visual.mjs', 'run'], {
					cwd: webDir,
					stdio: 'inherit'
				});
				child.on('close', (code) => {
					run.active = false;
					run.lastExit = code ?? 1;
				});
				res.statusCode = 202;
				res.setHeader('content-type', 'application/json');
				res.end(JSON.stringify({ started: true }));
			});
		}
	};
}
