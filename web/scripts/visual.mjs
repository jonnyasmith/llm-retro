#!/usr/bin/env node
// Visual-regression runner. Baselines must be produced in ONE controlled
// environment or fonts/anti-aliasing drift between machines and every diff is
// noise (see docs/adr/0007-*). That environment is the pinned Playwright Linux
// image below — the same image CI uses — so laptop runs and CI agree.
//
//   node scripts/visual.mjs run      compare stories against committed baselines
//   node scripts/visual.mjs update   (re)generate and overwrite baselines
//
// Add `--native` (or set VISUAL_NATIVE=1) to skip Docker and run directly in the
// current environment. CI already runs inside the image, so it uses --native.
// A --native run on macOS produces *-darwin baselines that are NOT committed;
// treat them as a throwaway local preview only.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Keep in lockstep with the installed `playwright` version so the bundled
// Chromium renders identically to the OS libraries baked into the image.
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.60.0-noble';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const [, , modeArg = 'run', ...rest] = process.argv;
const native = process.env.VISUAL_NATIVE === '1' || rest.includes('--native');
const passthrough = rest.filter((a) => a !== '--native');

const update = modeArg === 'update';
if (modeArg !== 'run' && modeArg !== 'update') {
	console.error(`Unknown mode "${modeArg}". Use "run" or "update".`);
	process.exit(2);
}

const vitestArgs = [
	'exec',
	'vitest',
	'run',
	'--project=storybook',
	...(update ? ['-u'] : []),
	...passthrough
];

function run(command, args, extraEnv = {}) {
	const result = spawnSync(command, args, {
		cwd: webDir,
		stdio: 'inherit',
		env: { ...process.env, ...extraEnv }
	});
	if (result.error) throw result.error;
	process.exit(result.status ?? 1);
}

if (native) {
	run('pnpm', vitestArgs, { VITE_VISUAL: '1' });
} else {
	// `-v /work/node_modules` masks the host (macOS) node_modules with a
	// container-only one so Linux binaries never clobber the laptop install.
	// A named volume caches the pnpm store across runs.
	const dockerArgs = [
		'run',
		'--rm',
		'--init',
		'--ipc=host',
		'-e',
		'VITE_VISUAL=1',
		'-e',
		'CI=1',
		'-v',
		`${webDir}:/work`,
		'-v',
		'/work/node_modules',
		'-v',
		'llm-retro-pnpm-store:/root/.local/share/pnpm/store',
		'-w',
		'/work',
		PLAYWRIGHT_IMAGE,
		'bash',
		'-lc',
		`corepack enable && pnpm install --frozen-lockfile --prefer-offline && pnpm ${vitestArgs.join(' ')}`
	];
	run('docker', dockerArgs);
}
