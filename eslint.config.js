import js from '@eslint/js';
import pluginSvelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.svelte-kit/', 'build/', 'node_modules/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...pluginSvelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      // Every occurrence measured here was `async` used to satisfy a
      // Promise-returning contract the rule cannot see — an AsyncIterator's
      // `return`, an implementation of an exported async function type. It has
      // no true positive in this codebase and punishes correct code.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // svelte-check type-checks components with the real compiler, which is
    // strictly better than what these rules see through the ESLint parser.
    files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Outside the app's tsconfig, so the type checker has no program for them
    // and every rule that needs one would report against an error type.
    files: ['drizzle.config.ts', 'eslint.config.js', 'svelte.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Reading an untyped response body or a JSON fixture is what a test does;
    // the type-safety rules describe test ergonomics rather than product risk
    // here. Everything the type checker can say about real defects —
    // floating promises, awaiting a non-thenable, an unbound method — stays on.
    files: ['**/*.test.ts', '**/*-fixture.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['src/app.d.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },
);
