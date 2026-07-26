/**
 * The presentation rules the read side uses to turn a value into a string.
 *
 * An absent value (null) reads as an em dash and is never rendered as zero: a
 * Token usage bucket a Harness does not report is absent, not empty.
 */
const absent = '—';
const grouped = new Intl.NumberFormat('en-GB');
const groupedToOneDecimal = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 1,
});

export function formatCount(value: number): string {
  return grouped.format(value);
}

export function formatAverage(value: number): string {
  return groupedToOneDecimal.format(value);
}

export function formatTokens(value: number | null): string {
  return value === null ? absent : grouped.format(value);
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return absent;
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1_000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const totalSeconds = Math.round(seconds);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

// Sliced rather than pattern-matched: the milliseconds a clock-derived instant
// carries are discarded by position, so every instant renders alike.
export function formatUtcTimestamp(milliseconds: number): string {
  const iso = new Date(milliseconds).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}
