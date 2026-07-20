import type { Meta, StoryObj } from '@storybook/sveltekit';
import { fn } from 'storybook/test';
import {
	ALL,
	EXTRACTOR_V,
	NOW,
	THEMES,
	THEME_STAMP,
	THEME_TYPE
} from '$lib/features/viewers/fixtures';
import InsightsPage from './InsightsPage.svelte';

const sessions = ALL.slice(0, 20);

const meta = {
	title: 'Pages/Insights',
	component: InsightsPage,
	tags: ['experimental', 'ownership-feature-insights'],
	parameters: { layout: 'fullscreen' },
	args: {
		f: sessions,
		variant: 'digest',
		selectedSessionId: sessions[0]?.id ?? null,
		selectedThemeId: 'T1',
		onSelectSession: fn(),
		onSelectTheme: fn(),
		onOpenMetrics: fn(),
		onOpenVariant: fn(),
		onOpenWorkbenchTurn: fn(),
		themes: THEMES,
		extractorVersion: EXTRACTOR_V,
		now: NOW,
		themeStamp: THEME_STAMP,
		themeTypes: THEME_TYPE,
		onRegenerate: fn()
	}
} satisfies Meta<typeof InsightsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Experimental headline-first page state. */
export const Digest: Story = {};
/** Experimental Session-first evidence page state. */
export const Workbench: Story = { args: { variant: 'workbench' } };
/** Experimental pattern-first page state. */
export const Explorer: Story = { args: { variant: 'explorer' } };
export const Empty: Story = {
	args: { f: [], selectedSessionId: null, selectedThemeId: null, variant: 'workbench' }
};
