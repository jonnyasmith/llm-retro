import { describe, expect, it } from 'vitest';
import { deriveLocalBuckets } from './time-buckets';

describe('deriveLocalBuckets', () => {
  it('maps instants on both sides of a DST boundary', () => {
    expect(
      deriveLocalBuckets(
        Date.parse('2025-03-30T00:30:00.000Z'),
        'Europe/London',
      ),
    ).toEqual({ localDow: 0, localHour: 0, localDate: '2025-03-30' });
    expect(
      deriveLocalBuckets(
        Date.parse('2025-03-30T01:30:00.000Z'),
        'Europe/London',
      ),
    ).toEqual({ localDow: 0, localHour: 2, localDate: '2025-03-30' });
  });

  it('maps an instant in a fractional-offset timezone', () => {
    expect(
      deriveLocalBuckets(
        Date.parse('2025-01-01T20:00:00.000Z'),
        'Asia/Kolkata',
      ),
    ).toEqual({ localDow: 4, localHour: 1, localDate: '2025-01-02' });
  });

  it('rejects invalid instants and timezone identifiers', () => {
    expect(() => deriveLocalBuckets(Number.NaN, 'Europe/London')).toThrow(
      'Invalid UTC epoch-millisecond timestamp',
    );
    expect(() => deriveLocalBuckets(0, 'Not/A_Timezone')).toThrow(RangeError);
  });
});
