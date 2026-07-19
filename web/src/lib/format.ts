export function formatCompact(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
	return `${value}`;
}

export function formatMinutes(minutes: number): string {
	return minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`;
}
