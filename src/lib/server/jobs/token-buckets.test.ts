import { describe, expect, it } from 'vitest';
import { accumulateTokens, nullTokenBuckets } from './token-buckets';

describe('Token usage buckets', () => {
  it('reports every bucket as absent until something is reported', () => {
    expect(nullTokenBuckets()).toEqual({
      input: null,
      output: null,
      cacheRead: null,
      cacheWrite: null,
    });
  });

  it('keeps a genuinely reported zero distinct from an absent bucket', () => {
    const buckets = nullTokenBuckets();
    accumulateTokens(buckets, 'output', 0);

    expect(buckets.output).toBe(0);
    expect(buckets.input).toBeNull();
  });

  it('sums repeated reports into one bucket', () => {
    const buckets = nullTokenBuckets();
    accumulateTokens(buckets, 'input', 10);
    accumulateTokens(buckets, 'input', 5);
    accumulateTokens(buckets, 'input', 0);

    expect(buckets.input).toBe(15);
  });

  it('leaves a bucket absent when the Harness reports no value for it', () => {
    const buckets = nullTokenBuckets();
    accumulateTokens(buckets, 'cacheWrite', undefined);
    accumulateTokens(buckets, 'cacheWrite', null);
    accumulateTokens(buckets, 'cacheWrite', 'not a number');

    expect(buckets.cacheWrite).toBeNull();
  });

  it('mixes reported and never-reported buckets in one set', () => {
    const buckets = nullTokenBuckets();
    accumulateTokens(buckets, 'input', 7);
    accumulateTokens(buckets, 'output', 3);
    accumulateTokens(buckets, 'output', 4);
    accumulateTokens(buckets, 'cacheRead', undefined);

    expect(buckets).toEqual({
      input: 7,
      output: 7,
      cacheRead: null,
      cacheWrite: null,
    });
  });
});
