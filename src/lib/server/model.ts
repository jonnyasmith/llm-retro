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

/** One Model response within an Interaction, as the Harness spelled it. */
export interface ModelCandidate {
  modelRaw: string;
  outputTokens: number;
}

export interface ServingModel {
  model: string;
  modelRaw: string;
}

interface CanonicalTally {
  model: string;
  modelRaw: string;
  modelRawOutputTokens: number;
  outputTokens: number;
}

/**
 * Which of the Models that responded within one Interaction served it: the one
 * with the most output tokens once every spelling is reduced to its canonical
 * identity. Canonicalising *before* tallying is the whole rule — tally on the
 * raw string and two spellings of one Model split its vote, handing the
 * Interaction to a rival that beat each spelling but not their sum.
 *
 * Provenance is the winner's highest-output spelling; ties at either level
 * resolve to the first spelling the Harness recorded. Returns null when no
 * Model responded, leaving the caller to phrase the error.
 */
export function resolveServingModel(
  candidates: readonly ModelCandidate[],
): ServingModel | null {
  const outputBySpelling = new Map<string, number>();
  for (const candidate of candidates) {
    outputBySpelling.set(
      candidate.modelRaw,
      (outputBySpelling.get(candidate.modelRaw) ?? 0) + candidate.outputTokens,
    );
  }

  const tallies = new Map<string, CanonicalTally>();
  for (const [modelRaw, outputTokens] of outputBySpelling) {
    const model = canonicaliseModel(modelRaw);
    const tally = tallies.get(model);
    if (tally === undefined) {
      tallies.set(model, {
        model,
        modelRaw,
        modelRawOutputTokens: outputTokens,
        outputTokens,
      });
      continue;
    }
    tally.outputTokens += outputTokens;
    if (outputTokens > tally.modelRawOutputTokens) {
      tally.modelRaw = modelRaw;
      tally.modelRawOutputTokens = outputTokens;
    }
  }

  let serving: CanonicalTally | null = null;
  for (const tally of tallies.values()) {
    if (serving === null || tally.outputTokens > serving.outputTokens) {
      serving = tally;
    }
  }
  return serving === null
    ? null
    : { model: serving.model, modelRaw: serving.modelRaw };
}
