import type { AccentToken, BadgeTone } from '$lib/design-system';

export interface InsightRailEntry {
	title: string;
	metadata: string;
	tool?: BadgeTone;
	markers?: { icon: string; count: number; accent: AccentToken }[];
}

export interface InsightRailHeader {
	label: string;
}

export interface InsightSectionHeading {
	label: string;
	suffix?: string;
}

export interface InsightSessionEvidence {
	id: string;
	title: string;
	tool?: string;
	degradedAt?: string;
}
