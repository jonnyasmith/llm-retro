import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runChecks } from './check-ui-architecture.mjs';

const roots: string[] = [];

function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'llm-retro-ui-architecture-'));
	roots.push(root);
	return root;
}

function write(root: string, name: string, source = '') {
	const target = path.join(root, name);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, source);
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('UI architecture checks', () => {
	it('explains the public replacement for obsolete and deep imports', () => {
		const root = fixture();
		write(root, 'src/lib/ui/Button.svelte');
		write(
			root,
			'src/lib/features/metrics/ui/Page.svelte',
			"import X from '$lib/design-system/atoms/X.svelte';"
		);

		expect(runChecks(root)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('migrate it to $lib/design-system or $lib/features'),
				expect.stringContaining('import from $lib/design-system')
			])
		);
	});

	it('rejects imports towards more-composed design-system levels', () => {
		const root = fixture();
		write(root, 'src/lib/design-system/atoms/Bad.svelte', "import X from '../molecules/X.svelte';");
		write(
			root,
			'src/lib/design-system/atoms/Bad.stories.ts',
			"tags: ['stable', 'ownership-shared']"
		);

		expect(runChecks(root)).toContainEqual(
			expect.stringContaining('atoms cannot import molecules')
		);
	});

	it('allows neutral grouping and a documented interactive exception', () => {
		const root = fixture();
		write(root, 'src/lib/features/metrics/ui/Group.svelte', '<div>Neutral group</div>');
		write(
			root,
			'src/lib/features/metrics/ui/OwnedControl.svelte',
			'<!-- ui-architecture-allow raw-interactive: owns native form submission -->\n<button>Save</button>'
		);

		expect(runChecks(root)).toEqual([]);
	});

	it('enforces the declared feature dependency graph and feature composition direction', () => {
		const root = fixture();
		write(
			root,
			'src/lib/features/viewers/ui/atoms/Bad.svelte',
			"import X from '$lib/features/metrics';\nimport Y from '../pages/Y.svelte';"
		);

		expect(runChecks(root)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('viewers cannot depend on metrics'),
				expect.stringContaining('atoms cannot import pages')
			])
		);
	});

	it('requires lifecycle and ownership metadata for public feature components', () => {
		const root = fixture();
		write(
			root,
			'src/lib/features/jobs/index.ts',
			"export { default as JobsPage } from './ui/pages/JobsPage.svelte';"
		);
		write(root, 'src/lib/features/jobs/ui/pages/JobsPage.svelte');
		write(
			root,
			'src/lib/features/jobs/ui/pages/JobsPage.stories.ts',
			"tags: ['stable', 'ownership-feature-viewers']"
		);

		expect(runChecks(root)).toContainEqual(expect.stringContaining('ownership-feature-jobs'));
	});

	it('rejects raw colours outside foundations and retired exports', () => {
		const root = fixture();
		write(
			root,
			'src/lib/design-system/index.ts',
			'export { default as OldButton } from "./atoms/OldButton.svelte";'
		);
		write(root, 'src/lib/features/metrics/ui/pages/Page.svelte', '<div style="color:#fff">x</div>');

		expect(runChecks(root, { deprecatedDesignSystemExports: ['OldButton'] })).toEqual(
			expect.arrayContaining([
				expect.stringContaining('raw colour literal'),
				expect.stringContaining('deprecated export OldButton')
			])
		);
	});

	it('prohibits new consumers of lifecycle-deprecated components', () => {
		const root = fixture();
		write(
			root,
			'src/lib/design-system/index.ts',
			"export { default as OldButton } from './atoms/OldButton.svelte';"
		);
		write(root, 'src/lib/design-system/atoms/OldButton.svelte');
		write(
			root,
			'src/lib/design-system/atoms/OldButton.stories.ts',
			"tags: ['deprecated', 'ownership-shared']"
		);
		write(
			root,
			'src/lib/features/metrics/ui/pages/Page.svelte',
			"import { OldButton as Button } from '$lib/design-system';"
		);

		expect(runChecks(root)).toContainEqual(
			expect.stringContaining('deprecated design-system import OldButton')
		);
	});

	it('checks dynamic deep imports and route orchestration', () => {
		const root = fixture();
		write(
			root,
			'src/routes/bad/+page.svelte',
			"import('$lib/features/metrics/ui/pages/Page.svelte');"
		);

		expect(runChecks(root)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('deep feature import'),
				expect.stringContaining('route pages must render')
			])
		);
	});
});
