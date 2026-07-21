import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';
import VisualReporter from './scripts/visual-reporter.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		// The visual reporter self-gates on VITE_VISUAL; it only writes its
		// manifest during visual runs, so the default reporter is untouched.
		reporters: ['default', new VisualReporter()],
		expect: {
			requireAssertions: true,
			// Small tolerance absorbs sub-pixel anti-aliasing noise while still
			// catching real visual regressions. Only applied in visual runs.
			toMatchScreenshot: {
				comparatorName: 'pixelmatch',
				comparatorOptions: { allowedMismatchedPixelRatio: 0.01 }
			}
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					setupFiles: ['./src/lib/mocks/vitest-setup.ts'],
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.test.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'happy-dom',
					setupFiles: ['./src/lib/mocks/vitest-setup.ts'],
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
				test: {
					name: 'storybook',
					setupFiles: ['./.storybook/vitest.visual-setup.ts'],
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [{ browser: 'chromium' }]
					}
				}
			}
		]
	}
});
