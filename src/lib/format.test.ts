import { describe, expect, it } from 'vitest';
import {
  formatAverage,
  formatCount,
  formatDuration,
  formatTokens,
  formatUtcTimestamp,
} from './format';

describe('formatCount', () => {
  it('groups thousands in the UK convention', () => {
    expect(formatCount(1234567)).toEqual('1,234,567');
    expect(formatCount(1000)).toEqual('1,000');
    expect(formatCount(999)).toEqual('999');
  });

  it('renders a zero count as zero', () => {
    expect(formatCount(0)).toEqual('0');
  });
});

describe('formatAverage', () => {
  it('groups thousands and keeps at most one fraction digit', () => {
    expect(formatAverage(12345.678)).toEqual('12,345.7');
    expect(formatAverage(2.25)).toEqual('2.3');
  });

  it('drops the fraction when it rounds away', () => {
    expect(formatAverage(4.04)).toEqual('4');
    expect(formatAverage(3)).toEqual('3');
  });
});

describe('formatTokens', () => {
  it('groups thousands in the UK convention', () => {
    expect(formatTokens(1234567)).toEqual('1,234,567');
  });

  it('renders an unreported bucket as an em dash rather than zero', () => {
    expect(formatTokens(null)).toEqual('—');
    expect(formatTokens(0)).toEqual('0');
  });
});

describe('formatDuration', () => {
  it('keeps millisecond precision below a second', () => {
    expect(formatDuration(0)).toEqual('0 ms');
    expect(formatDuration(120)).toEqual('120 ms');
    expect(formatDuration(999)).toEqual('999 ms');
  });

  it('switches to seconds with one fraction digit at a second', () => {
    expect(formatDuration(1000)).toEqual('1.0 s');
    expect(formatDuration(1500)).toEqual('1.5 s');
    expect(formatDuration(59_999)).toEqual('60.0 s');
  });

  it('switches to minutes and seconds at a minute', () => {
    expect(formatDuration(60_000)).toEqual('1m 0s');
    expect(formatDuration(180_000)).toEqual('3m 0s');
    expect(formatDuration(200_000)).toEqual('3m 20s');
  });

  it('renders an absent duration as an em dash rather than zero', () => {
    expect(formatDuration(null)).toEqual('—');
  });
});

describe('formatUtcTimestamp', () => {
  it('discards the milliseconds a clock-derived instant carries', () => {
    expect(formatUtcTimestamp(Date.parse('2026-07-25T12:00:00.123Z'))).toEqual(
      '2026-07-25 12:00:00 UTC',
    );
    expect(formatUtcTimestamp(Date.parse('2026-07-25T23:59:59.999Z'))).toEqual(
      '2026-07-25 23:59:59 UTC',
    );
  });

  it('renders an instant on an exact second identically', () => {
    expect(formatUtcTimestamp(Date.parse('2026-07-25T12:00:00.000Z'))).toEqual(
      '2026-07-25 12:00:00 UTC',
    );
  });
});
