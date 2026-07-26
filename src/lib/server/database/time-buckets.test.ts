import { describe, expect, it } from 'vitest';
import { createLocalBucketDeriver } from './time-buckets';

describe('createLocalBucketDeriver', () => {
  it('maps instants on both sides of a DST boundary', () => {
    const london = createLocalBucketDeriver('Europe/London');

    expect(london.derive(Date.parse('2025-03-30T00:30:00.000Z'))).toEqual({
      localDow: 0,
      localHour: 0,
      localDate: '2025-03-30',
    });
    expect(london.derive(Date.parse('2025-03-30T01:30:00.000Z'))).toEqual({
      localDow: 0,
      localHour: 2,
      localDate: '2025-03-30',
    });
  });

  it('maps an instant in a fractional-offset timezone', () => {
    expect(
      createLocalBucketDeriver('Asia/Kolkata').derive(
        Date.parse('2025-01-01T20:00:00.000Z'),
      ),
    ).toEqual({ localDow: 4, localHour: 1, localDate: '2025-01-02' });
  });

  it('rejects an unrecognised timezone at construction', () => {
    expect(() => createLocalBucketDeriver('Not/A_Timezone')).toThrow(
      RangeError,
    );
  });

  it('rejects an instant that is not a finite epoch millisecond', () => {
    expect(() =>
      createLocalBucketDeriver('Europe/London').derive(Number.NaN),
    ).toThrow('Invalid UTC epoch-millisecond timestamp');
  });
});
