import { describe, expect, it } from 'vitest';
import {
  formatAverage,
  formatCount,
  formatDuration,
  formatTokens,
  formatUtcTimestamp,
} from './format';

describe('formatCount', () => {
  it.each([
    [1234567, '1,234,567'],
    [1000, '1,000'],
    [999, '999'],
  ])('groups thousands in the UK convention', (count, expected) => {
    expect(formatCount(count)).toEqual(expected);
  });

  it('renders a zero count as zero', () => {
    expect(formatCount(0)).toEqual('0');
  });
});

describe('formatAverage', () => {
  it('groups thousands in the UK convention', () => {
    expect(formatAverage(12345.678)).toEqual('12,345.7');
  });

  it('keeps at most one fraction digit', () => {
    expect(formatAverage(2.25)).toEqual('2.3');
  });

  it.each([
    [4.04, '4'],
    [3, '3'],
  ])('drops the fraction when it rounds away', (average, expected) => {
    expect(formatAverage(average)).toEqual(expected);
  });
});

describe('formatTokens', () => {
  it('groups thousands in the UK convention', () => {
    expect(formatTokens(1234567)).toEqual('1,234,567');
  });

  it('renders an unreported bucket as an em dash', () => {
    expect(formatTokens(null)).toEqual('—');
  });

  it('renders a genuinely reported zero as zero', () => {
    expect(formatTokens(0)).toEqual('0');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 ms'],
    [120, '120 ms'],
    [999, '999 ms'],
  ])('keeps millisecond precision below a second', (duration, expected) => {
    expect(formatDuration(duration)).toEqual(expected);
  });

  it.each([
    [1000, '1.0 s'],
    [1500, '1.5 s'],
    [59_999, '60.0 s'],
  ])(
    'switches to seconds with one fraction digit at a second',
    (duration, expected) => {
      expect(formatDuration(duration)).toEqual(expected);
    },
  );

  it.each([
    [60_000, '1m 0s'],
    [180_000, '3m 0s'],
    [200_000, '3m 20s'],
  ])('switches to minutes and seconds at a minute', (duration, expected) => {
    expect(formatDuration(duration)).toEqual(expected);
  });

  it('renders an absent duration as an em dash rather than zero', () => {
    expect(formatDuration(null)).toEqual('—');
  });
});

describe('formatUtcTimestamp', () => {
  it.each([
    ['2026-07-25T12:00:00.123Z', '2026-07-25 12:00:00 UTC'],
    ['2026-07-25T23:59:59.999Z', '2026-07-25 23:59:59 UTC'],
  ])(
    'discards the milliseconds a clock-derived instant carries',
    (instant, expected) => {
      expect(formatUtcTimestamp(Date.parse(instant))).toEqual(expected);
    },
  );

  it('renders an instant on an exact second identically', () => {
    expect(formatUtcTimestamp(Date.parse('2026-07-25T12:00:00.000Z'))).toEqual(
      '2026-07-25 12:00:00 UTC',
    );
  });
});
