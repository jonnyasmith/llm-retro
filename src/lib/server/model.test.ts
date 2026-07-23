import { describe, expect, it } from 'vitest';
import { canonicaliseModel, providerOf } from './model';

describe('model canonicalisation', () => {
  it('strips variant tags and snapshot dates to the canonical identity', () => {
    expect(canonicaliseModel('claude-opus-4-8[1m]')).toBe('claude-opus-4-8');
    expect(canonicaliseModel('gpt-5.1-codex-max-20260701')).toBe(
      'gpt-5.1-codex-max',
    );
    expect(canonicaliseModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
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
