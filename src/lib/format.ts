const number = new Intl.NumberFormat('en-GB');

// Absent buckets (null) read as an em dash so they are never mistaken for zero.
export function formatTokens(value: number | null): string {
  return value === null ? '—' : number.format(value);
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
