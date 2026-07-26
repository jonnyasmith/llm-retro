/**
 * The four canonical Token usage buckets and the one rule for filling them: a
 * bucket a Harness does not report stays null (absent), never zero, while a
 * genuinely reported zero is a real measurement. A log reader supplies only the
 * Harness-shaped part — which wire field means which bucket.
 */
export interface TokenBuckets {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
}

/** A fresh set of buckets, nothing reported yet. */
export function nullTokenBuckets(): TokenBuckets {
  return { input: null, output: null, cacheRead: null, cacheWrite: null };
}

/**
 * Fold one reported value into one bucket. A value that is not a number is not
 * a report, and the bucket is left exactly as it was — so a bucket no record
 * ever reports stays null instead of accumulating to zero.
 */
export function accumulateTokens(
  buckets: TokenBuckets,
  bucket: keyof TokenBuckets,
  reported: unknown,
): void {
  if (typeof reported !== 'number') return;
  buckets[bucket] = (buckets[bucket] ?? 0) + reported;
}
