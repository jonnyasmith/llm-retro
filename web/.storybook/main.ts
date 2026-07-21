import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|ts|svelte)'],
	staticDirs: ['../static'],
	addons: [
		'@storybook/addon-docs',
		'@storybook/addon-a11y',
		'@storybook/addon-vitest',
		'@storybook/addon-svelte-csf',
		'./visual/preset.ts'
	],
	framework: '@storybook/sveltekit'
};

export default config;
