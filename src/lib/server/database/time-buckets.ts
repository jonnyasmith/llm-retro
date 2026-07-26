/** The local day-of-week, hour and calendar date an instant falls in. */
export interface LocalBuckets {
  localDow: number;
  localHour: number;
  localDate: string;
}

/**
 * Derives ADR-0005's precomputed local buckets for one timezone.
 *
 * Bound to a timezone rather than taking one per call because the formatter it
 * holds is the expensive part, and both Ingestion and a timezone rebuild derive
 * buckets for every Interaction they touch in a single pass.
 */
export interface LocalBucketDeriver {
  /** The buckets a UTC epoch-millisecond instant falls in. */
  derive(utcEpochMilliseconds: number): LocalBuckets;
}

/**
 * The deriver for a timezone. Constructing it is how a timezone is validated:
 * an identifier no zone answers to is rejected here, with a plain `RangeError`.
 * This module sits under the Store and knows nothing of Settings, so a caller
 * holding untrusted input is the one that translates the failure.
 */
export function createLocalBucketDeriver(timezone: string): LocalBucketDeriver {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });

  return {
    derive(utcEpochMilliseconds) {
      if (!Number.isFinite(utcEpochMilliseconds)) {
        throw new RangeError('Invalid UTC epoch-millisecond timestamp');
      }

      const parts = formatter.formatToParts(new Date(utcEpochMilliseconds));
      const values = Object.fromEntries(
        parts.map(({ type, value }) => [type, value]),
      );
      const year = Number(values.year);
      const month = Number(values.month);
      const day = Number(values.day);

      return {
        localDow: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
        localHour: Number(values.hour),
        localDate: `${values.year}-${values.month}-${values.day}`,
      };
    },
  };
}
