import { describe, expect, it } from 'vitest';
import {
  createActivityHeatmap,
  intensityLevelFor,
  intensityLevels,
} from './activity-heatmap';

describe('intensityLevels', () => {
  it('is the unshaded level plus four bands', () => {
    expect(intensityLevels).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('intensityLevelFor', () => {
  it('leaves an hour with no Interactions unshaded', () => {
    expect(intensityLevelFor(0, 100)).toEqual(0);
    expect(intensityLevelFor(0, 1)).toEqual(0);
    // The ratio is undefined here, so zero has to be a level rather than a
    // band: a week with no Interactions at all peaks at zero too.
    expect(intensityLevelFor(0, 0)).toEqual(0);
  });

  it('puts the busiest hour in the strongest band', () => {
    expect(intensityLevelFor(100, 100)).toEqual(4);
    expect(intensityLevelFor(3, 3)).toEqual(4);
    expect(intensityLevelFor(1, 1)).toEqual(4);
  });

  it('keeps the smallest non-zero count visible against any peak', () => {
    expect(intensityLevelFor(1, 100)).toEqual(1);
    expect(intensityLevelFor(1, 1000)).toEqual(1);
  });

  it('holds a count landing exactly on a band edge in the lower band', () => {
    expect(intensityLevelFor(25, 100)).toEqual(1);
    expect(intensityLevelFor(50, 100)).toEqual(2);
    expect(intensityLevelFor(75, 100)).toEqual(3);
  });

  it('lifts a count one above a band edge into the next band', () => {
    expect(intensityLevelFor(26, 100)).toEqual(2);
    expect(intensityLevelFor(51, 100)).toEqual(3);
    expect(intensityLevelFor(76, 100)).toEqual(4);
  });

  it('bands against the given peak rather than an absolute count', () => {
    expect(intensityLevelFor(2, 8)).toEqual(1);
    expect(intensityLevelFor(2, 4)).toEqual(2);
    expect(intensityLevelFor(2, 3)).toEqual(3);
    expect(intensityLevelFor(2, 2)).toEqual(4);
  });
});

describe('createActivityHeatmap', () => {
  const loaded = [
    { localDow: 1, localHour: 9, interactionCount: 2 },
    { localDow: 6, localHour: 23, interactionCount: 8 },
  ];

  it('reads a loaded cell by its local day and hour', () => {
    const heatmap = createActivityHeatmap(loaded);

    expect(heatmap.countAt(1, 9)).toEqual(2);
    expect(heatmap.countAt(6, 23)).toEqual(8);
  });

  it('keeps the local day and the local hour apart', () => {
    const heatmap = createActivityHeatmap([
      { localDow: 2, localHour: 3, interactionCount: 5 },
      { localDow: 3, localHour: 2, interactionCount: 7 },
    ]);

    expect(heatmap.countAt(2, 3)).toEqual(5);
    expect(heatmap.countAt(3, 2)).toEqual(7);
  });

  it('counts an hour with no loaded cell as zero', () => {
    const heatmap = createActivityHeatmap(loaded);

    expect(heatmap.countAt(1, 10)).toEqual(0);
    expect(heatmap.countAt(0, 0)).toEqual(0);
  });

  it('peaks at the busiest loaded cell', () => {
    expect(createActivityHeatmap(loaded).peakInteractionCount).toEqual(8);
  });

  it('peaks at zero when nothing is loaded', () => {
    expect(createActivityHeatmap([]).peakInteractionCount).toEqual(0);
  });

  it('reads every hour as zero and unshaded when nothing is loaded', () => {
    const heatmap = createActivityHeatmap([]);

    expect(heatmap.countAt(1, 9)).toEqual(0);
    expect(heatmap.levelFor(0)).toEqual(0);
  });

  it('shades against the loaded peak', () => {
    const heatmap = createActivityHeatmap(loaded);

    expect(heatmap.levelFor(0)).toEqual(0);
    expect(heatmap.levelFor(2)).toEqual(1);
    expect(heatmap.levelFor(8)).toEqual(4);
  });
});
