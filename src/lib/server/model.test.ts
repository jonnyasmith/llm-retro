import { describe, expect, it } from 'vitest';
import { canonicaliseModel, providerOf, resolveServingModel } from './model';

describe('model canonicalisation', () => {
  it('strips variant tags and snapshot dates to the canonical identity', () => {
    expect(canonicaliseModel('claude-opus-4-8[1m]')).toBe('claude-opus-4-8');
    expect(canonicaliseModel('gpt-5.1-codex-max-20260701')).toBe(
      'gpt-5.1-codex-max',
    );
    expect(canonicaliseModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });

  it('strips a variant tag that follows a snapshot date', () => {
    // Load-bearing ordering: strip the tag first or the date anchor never
    // matches, and the two spellings of one Model stop being one candidate.
    expect(canonicaliseModel('claude-opus-4-8-20260101[1m]')).toBe(
      'claude-opus-4-8',
    );
  });
});

describe('provider derivation', () => {
  it('maps known prefixes to their Provider', () => {
    expect(providerOf('claude-opus-4-8')).toBe('anthropic');
    expect(providerOf('gpt-5.1-codex-max')).toBe('openai');
    expect(providerOf('o3')).toBe('openai');
    expect(providerOf('gemini-2.5-pro')).toBe('google');
  });

  it('discloses an unmatched Model as unknown rather than mis-attributing it', () => {
    expect(providerOf('mystery-model')).toBe('unknown');
  });
});

describe('serving Model resolution', () => {
  it('sums two spellings of one Model over a rival that beats each alone', () => {
    expect(
      resolveServingModel([
        { modelRaw: 'claude-opus-4-8-20260101', outputTokens: 10 },
        { modelRaw: 'claude-opus-4-8[1m]', outputTokens: 8 },
        { modelRaw: 'claude-sonnet-4-6', outputTokens: 12 },
      ]),
    ).toEqual({
      model: 'claude-opus-4-8',
      modelRaw: 'claude-opus-4-8-20260101',
    });
  });

  it('merges a snapshot-date spelling with its bare canonical identity', () => {
    expect(
      resolveServingModel([
        { modelRaw: 'gpt-5.1-codex-max-20260701', outputTokens: 4 },
        { modelRaw: 'gpt-5.1-codex-max', outputTokens: 3 },
        { modelRaw: 'claude-sonnet-4-6', outputTokens: 6 },
      ])?.model,
    ).toBe('gpt-5.1-codex-max');
  });

  it('merges a bracketed-tag spelling with its bare canonical identity', () => {
    expect(
      resolveServingModel([
        { modelRaw: 'claude-opus-4-8[1m]', outputTokens: 4 },
        { modelRaw: 'claude-opus-4-8', outputTokens: 3 },
        { modelRaw: 'claude-sonnet-4-6', outputTokens: 6 },
      ])?.model,
    ).toBe('claude-opus-4-8');
  });

  it('returns nothing when no Model responded, leaving the error to the caller', () => {
    expect(resolveServingModel([])).toBeNull();
  });

  it('resolves a lone candidate to itself, provenance intact', () => {
    expect(
      resolveServingModel([
        { modelRaw: 'claude-opus-4-8[1m]', outputTokens: 0 },
      ]),
    ).toEqual({ model: 'claude-opus-4-8', modelRaw: 'claude-opus-4-8[1m]' });
  });

  it('breaks a tie between distinct Models on the first one recorded', () => {
    expect(
      resolveServingModel([
        { modelRaw: 'claude-sonnet-4-6', outputTokens: 7 },
        { modelRaw: 'gpt-5.4', outputTokens: 7 },
      ])?.model,
    ).toBe('claude-sonnet-4-6');
  });

  it('reports the highest-output spelling of the winner as provenance', () => {
    expect(
      resolveServingModel([
        { modelRaw: 'claude-opus-4-8[1m]', outputTokens: 3 },
        { modelRaw: 'claude-opus-4-8-20260101', outputTokens: 5 },
        { modelRaw: 'claude-opus-4-8[1m]', outputTokens: 3 },
      ]),
    ).toEqual({
      model: 'claude-opus-4-8',
      // Spellings are summed before they are compared, exactly as the
      // canonical identities are: 3 + 3 beats a single 5.
      modelRaw: 'claude-opus-4-8[1m]',
    });
  });

  it('breaks a tie between spellings of the winner on the first recorded', () => {
    expect(
      resolveServingModel([
        { modelRaw: 'claude-opus-4-8-20260101', outputTokens: 5 },
        { modelRaw: 'claude-opus-4-8[1m]', outputTokens: 5 },
      ])?.modelRaw,
    ).toBe('claude-opus-4-8-20260101');
  });
});
