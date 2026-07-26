/** One loaded Activity cell: an hour of the local week that saw Interactions. */
export interface ActivityCell {
  localDow: number;
  localHour: number;
  interactionCount: number;
}

/**
 * Every intensity level a heatmap cell can carry, weakest first. Level zero is
 * unshaded; the four above it are the bands. The level lands on the grid as a
 * `data-level` attribute, and the Activity screen's CSS shades against exactly
 * these values — adding a band here without a rule there leaves it unpainted.
 */
export const intensityLevels = [0, 1, 2, 3, 4] as const;

const bands = intensityLevels.length - 1;

/**
 * The band a count belongs in, relative to the busiest hour loaded.
 *
 * Zero is a level, not a band: an hour with no Interactions returns the
 * unshaded level directly rather than falling through the ratio, so "nothing
 * happened" is never painted the same as "a little happened". Everything above
 * it rounds up, which keeps a single Interaction in a quiet week visible and
 * puts the peak itself in the strongest band.
 */
export function intensityLevelFor(
  interactionCount: number,
  peakInteractionCount: number,
): number {
  if (interactionCount === 0) return 0;
  return Math.ceil((interactionCount / peakInteractionCount) * bands);
}

/**
 * The full seven-by-twenty-four week the Activity screen draws, read off the
 * sparse cell list the Store loaded.
 */
export interface ActivityHeatmap {
  /** The busiest hour's count, and the peak every level is measured against. */
  readonly peakInteractionCount: number;
  /** An hour no loaded cell covers saw nothing, so it counts as zero. */
  countAt(localDow: number, localHour: number): number;
  /** The band a count belongs in, against this week's own peak. */
  levelFor(interactionCount: number): number;
}

/**
 * Buckets the loaded cells by local day and hour, and binds the quantisation to
 * the peak across them.
 *
 * The day ordering is not here: Monday-first with Sunday last is fixed
 * presentation with no data dependency, and belongs with the grid markup.
 */
export function createActivityHeatmap(
  cells: readonly ActivityCell[],
): ActivityHeatmap {
  const counts = new Map<string, number>();
  // Zero, not negative infinity: a maximum taken across no cells at all must
  // still read as a peak, and an empty Activity list is the case that reaches
  // it. This seed is that guard.
  let peakInteractionCount = 0;

  for (const cell of cells) {
    counts.set(`${cell.localDow}:${cell.localHour}`, cell.interactionCount);
    if (cell.interactionCount > peakInteractionCount) {
      peakInteractionCount = cell.interactionCount;
    }
  }

  return {
    peakInteractionCount,
    countAt(localDow, localHour) {
      return counts.get(`${localDow}:${localHour}`) ?? 0;
    },
    levelFor(interactionCount) {
      return intensityLevelFor(interactionCount, peakInteractionCount);
    },
  };
}
