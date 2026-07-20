import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lifecycleTags = ['experimental', 'stable', 'deprecated'];
const compositionRanks = new Map([
	['foundations', 0],
	['atoms', 1],
	['molecules', 2],
	['organisms', 3],
	['templates', 4],
	['pages', 5]
]);

const allowedFeatureDependencies = new Map([
	['control-plane', new Set()],
	['viewers', new Set()],
	['metrics', new Set(['viewers'])],
	['insights', new Set(['viewers'])],
	['jobs', new Set(['viewers'])],
	['viewer-shell', new Set(['viewers', 'metrics', 'insights', 'jobs'])]
]);

function filesBelow(root) {
	if (!existsSync(root)) return [];
	return readdirSync(root).flatMap((entry) => {
		const candidate = path.join(root, entry);
		return statSync(candidate).isDirectory() ? filesBelow(candidate) : [candidate];
	});
}

function relative(root, file) {
	return path.relative(root, file).split(path.sep).join('/');
}

function hasException(source, rule) {
	return source.includes(`ui-architecture-allow ${rule}:`);
}

function imports(source) {
	return [...source.matchAll(/(?:from\s+|import\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(
		(match) => match[1]
	);
}

function deprecatedExports(designSystemRoot) {
	const index = path.join(designSystemRoot, 'index.ts');
	if (!existsSync(index)) return new Set();
	const deprecated = new Set();
	const source = readFileSync(index, 'utf8');
	for (const match of source.matchAll(
		/export\s+{\s*default\s+as\s+(\w+)\s*}\s+from\s+['"]([^'"]+\.svelte)['"]/g
	)) {
		const component = path.resolve(path.dirname(index), match[2]);
		const story = [
			component.replace(/\.svelte$/, '.stories.ts'),
			component.replace(/\.svelte$/, '.stories.svelte')
		].find(existsSync);
		if (story && /['"]deprecated['"]/.test(readFileSync(story, 'utf8'))) deprecated.add(match[1]);
	}
	return deprecated;
}

export function runChecks(root, policy = {}) {
	const failures = [];
	const sourceRoot = path.join(root, 'src');
	const designSystemRoot = path.join(sourceRoot, 'lib/design-system');
	const featureRoot = path.join(sourceRoot, 'lib/features');
	const deprecated = deprecatedExports(designSystemRoot);
	const obsolete = [
		'src/routes/prototype',
		'src/lib/components/prototypes',
		'src/lib/prototype',
		'src/lib/ui'
	];

	for (const oldPath of obsolete) {
		if (existsSync(path.join(root, oldPath))) {
			failures.push(
				`${oldPath}: obsolete UI path; migrate it to $lib/design-system or $lib/features`
			);
		}
	}

	const codeFiles = filesBelow(sourceRoot).filter((file) => /\.(?:svelte|ts|js)$/.test(file));
	for (const file of codeFiles) {
		const rel = relative(root, file);
		const source = readFileSync(file, 'utf8');
		const fileImports = imports(source);
		if (!file.startsWith(designSystemRoot) && deprecated.size) {
			for (const match of source.matchAll(
				/import\s*{([^}]+)}\s*from\s*['"]\$lib\/design-system['"]/g
			)) {
				const names = match[1].split(',').map((entry) => entry.trim().split(/\s+as\s+/)[0]);
				for (const name of names.filter((candidate) => deprecated.has(candidate))) {
					failures.push(
						`${rel}: deprecated design-system import ${name}; use the replacement documented in its story`
					);
				}
			}
		}

		if (file.startsWith(designSystemRoot)) {
			for (const specifier of fileImports) {
				if (/^(?:\$app|@sveltejs\/kit|\$lib\/(?:features|server)|.*routes\/)/.test(specifier)) {
					failures.push(
						`${rel}: shared design-system code cannot import ${specifier}; pass data and callbacks through its public API`
					);
				}
			}

			const sourceLevel = rel.split('/').find((part) => compositionRanks.has(part));
			const sourceRank = compositionRanks.get(sourceLevel);
			for (const specifier of fileImports.filter((value) => value.startsWith('.'))) {
				const target = path.resolve(path.dirname(file), specifier);
				const targetRel = relative(designSystemRoot, target);
				const targetLevel = targetRel.split('/').find((part) => compositionRanks.has(part));
				const targetRank = compositionRanks.get(targetLevel);
				if (sourceRank !== undefined && targetRank !== undefined && targetRank > sourceRank) {
					failures.push(
						`${rel}: ${sourceLevel} cannot import ${targetLevel}; compose only from the same or less-composed levels`
					);
				}
			}
		}

		for (const specifier of fileImports) {
			if (
				specifier.startsWith('$lib/design-system/') &&
				specifier !== '$lib/design-system/tokens.css'
			) {
				failures.push(
					`${rel}: deep design-system import ${specifier}; import from $lib/design-system`
				);
			}
			const featureMatch = specifier.match(/^\$lib\/features\/([^/]+)\/(.+)/);
			if (featureMatch) {
				const storyFixture = rel.endsWith('.stories.ts') && featureMatch[2] === 'fixtures';
				if (!storyFixture) {
					failures.push(
						`${rel}: deep feature import ${specifier}; import from $lib/features/${featureMatch[1]}`
					);
				}
			}
		}

		if (file.startsWith(featureRoot)) {
			const owner = relative(featureRoot, file).split('/')[0];
			const sourceLevel = rel.split('/').find((part) => compositionRanks.has(part));
			const sourceRank = compositionRanks.get(sourceLevel);
			for (const specifier of fileImports) {
				if (specifier.startsWith('.')) {
					const target = path.resolve(path.dirname(file), specifier);
					if (target.startsWith(featureRoot)) {
						const targetOwner = relative(featureRoot, target).split('/')[0];
						if (targetOwner !== owner) {
							failures.push(
								`${rel}: relative cross-feature import ${specifier}; import from $lib/features/${targetOwner}`
							);
						}
						const targetLevel = relative(featureRoot, target)
							.split('/')
							.find((part) => compositionRanks.has(part));
						const targetRank = compositionRanks.get(targetLevel);
						if (sourceRank !== undefined && targetRank !== undefined && targetRank > sourceRank) {
							failures.push(
								`${rel}: ${sourceLevel} cannot import ${targetLevel}; compose only from the same or less-composed levels`
							);
						}
					}
				}
				const match = specifier.match(/^\$lib\/features\/([^/]+)$/);
				if (match && match[1] !== owner && !allowedFeatureDependencies.get(owner)?.has(match[1])) {
					failures.push(
						`${rel}: ${owner} cannot depend on ${match[1]}; follow the declared feature dependency graph`
					);
				}
			}
		}

		if (
			/\.(?:svelte|css)$/.test(file) &&
			!file.startsWith(path.join(designSystemRoot, 'foundations')) &&
			!rel.endsWith('assets/favicon.svg') &&
			!hasException(source, 'raw-colour') &&
			/(?:^|[\s:(,])#[0-9a-fA-F]{3,8}\b/.test(source)
		) {
			failures.push(`${rel}: raw colour literal is prohibited; use a semantic foundation token`);
		}

		if (
			(file.startsWith(featureRoot) || rel.startsWith('src/routes/')) &&
			/\.svelte$/.test(file) &&
			!rel.endsWith('.stories.svelte') &&
			!hasException(source, 'raw-interactive') &&
			/<(?:button|input|select|textarea|a)(?:\s|>)/.test(source)
		) {
			failures.push(
				`${rel}: raw interactive markup is prohibited here; use the owning design-system control or document a narrow raw-interactive exception`
			);
		}
	}

	for (const route of codeFiles.filter((file) => /src\/routes\/.*\+page\.svelte$/.test(file))) {
		const rel = relative(root, route);
		const source = readFileSync(route, 'utf8');
		if (!imports(source).some((specifier) => /^\$lib\/features\/[^/]+$/.test(specifier))) {
			failures.push(
				`${rel}: route pages must render a page-level feature public API; import from $lib/features/<feature>`
			);
		}
		const featureImports = imports(source)
			.map((specifier) => specifier.match(/^\$lib\/features\/([^/]+)$/)?.[1])
			.filter(Boolean);
		if (
			featureImports.length &&
			!featureImports.some(
				(owner) =>
					source.includes(`<${owner === 'viewer-shell' ? 'ViewerPage' : ''}`) ||
					/<[A-Z][A-Za-z0-9]*\b/.test(source)
			)
		) {
			failures.push(`${rel}: route must render the imported page-level feature component`);
		}
		if (/<style(?:\s|>)/.test(source)) {
			failures.push(
				`${rel}: route pages cannot own visual layout; move it to a feature page or template`
			);
		}
	}

	for (const owner of filesBelow(featureRoot)
		.filter((file) => path.basename(file) === 'index.ts')
		.map((file) => relative(featureRoot, path.dirname(file)).split('/')[0])) {
		const index = path.join(featureRoot, owner, 'index.ts');
		const source = readFileSync(index, 'utf8');
		for (const match of source.matchAll(
			/export\s+{\s*default\s+as\s+\w+\s*}\s+from\s+['"]([^'"]+\.svelte)['"]/g
		)) {
			const component = path.resolve(path.dirname(index), match[1]);
			const story = [
				component.replace(/\.svelte$/, '.stories.ts'),
				component.replace(/\.svelte$/, '.stories.svelte')
			].find(existsSync);
			const rel = relative(root, component);
			if (!story) {
				failures.push(`${rel}: public feature component needs a colocated lifecycle story`);
				continue;
			}
			const storySource = readFileSync(story, 'utf8');
			const states = lifecycleTags.filter((tag) => new RegExp(`['"]${tag}['"]`).test(storySource));
			if (states.length !== 1) {
				failures.push(
					`${relative(root, story)}: include exactly one lifecycle tag: ${lifecycleTags.join(', ')}`
				);
			}
			if (!new RegExp(`['"]ownership-feature-${owner}['"]`).test(storySource)) {
				failures.push(
					`${relative(root, story)}: feature stories require the ownership-feature-${owner} tag`
				);
			}
		}
	}

	for (const retired of policy.deprecatedDesignSystemExports ?? []) {
		const index = path.join(designSystemRoot, 'index.ts');
		if (existsSync(index) && new RegExp(`\\b${retired}\\b`).test(readFileSync(index, 'utf8'))) {
			failures.push(
				`src/lib/design-system/index.ts: deprecated export ${retired} must be removed after its retirement date`
			);
		}
	}

	const components = filesBelow(designSystemRoot).filter((file) => file.endsWith('.svelte'));
	for (const component of components) {
		const storyCandidates = [
			component.replace(/\.svelte$/, '.stories.ts'),
			component.replace(/\.svelte$/, '.stories.svelte')
		];
		const story = storyCandidates.find(existsSync);
		const rel = relative(root, component);
		if (!story) {
			failures.push(
				`${rel}: public shared component needs a colocated story with lifecycle and ownership metadata`
			);
			continue;
		}
		const storySource = readFileSync(story, 'utf8');
		const states = lifecycleTags.filter((tag) => new RegExp(`['"]${tag}['"]`).test(storySource));
		if (states.length !== 1) {
			failures.push(
				`${relative(root, story)}: include exactly one lifecycle tag: ${lifecycleTags.join(', ')}`
			);
		}
		if (!/['"]ownership-shared['"]/.test(storySource)) {
			failures.push(`${relative(root, story)}: shared stories require the ownership-shared tag`);
		}
	}

	return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const failures = runChecks(process.cwd());
	if (failures.length) {
		console.error(failures.map((failure) => `- ${failure}`).join('\n'));
		process.exitCode = 1;
	} else {
		console.log('UI architecture checks passed');
	}
}
