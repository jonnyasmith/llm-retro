type ColourToken = `--${string}`;

function readColour(token: ColourToken): string {
	const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
	if (!value) throw new Error(`Missing chart colour token: ${token}`);
	return value;
}

/** Resolve the shared UI colour tokens for ECharts' canvas renderer. */
export function chartColours() {
	return {
		backgroundSecondary: readColour('--panel2'),
		line: readColour('--line'),
		text: readColour('--muted'),
		ink: readColour('--ink'),
		accent: readColour('--accent'),
		accentSecondary: readColour('--accent2'),
		accentArea: readColour('--accent-chart-area'),
		good: readColour('--good'),
		warn: readColour('--warn'),
		bad: readColour('--bad'),
		courseCorrection: readColour('--inference-course-correction'),
		dumbZone: readColour('--inference-dumb-zone'),
		claude: readColour('--claude'),
		codex: readColour('--codex'),
		pi: readColour('--pi')
	};
}
