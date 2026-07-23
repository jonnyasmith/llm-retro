export type Provider = 'anthropic' | 'openai' | 'google' | 'unknown';

// Strip a trailing `[…]` variant tag then a `-YYYYMMDD` snapshot date; the
// order matters because a tag can follow the date.
export function canonicaliseModel(model: string): string {
  return model.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
}

export function providerOf(canonicalModel: string): Provider {
  if (canonicalModel.startsWith('claude')) return 'anthropic';
  if (canonicalModel.startsWith('gpt') || canonicalModel.startsWith('o')) {
    return 'openai';
  }
  if (canonicalModel.startsWith('gemini')) return 'google';
  return 'unknown';
}
