import { routeProps, textsOf } from '$lib/render-fixture';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Models from './+page.svelte';
import type { PageData } from './$types';

type HarnessRow = PageData['harnesses'][number];
type ModelRow = PageData['models'][number];

// An absent bucket sits beside a genuine zero on purpose: an implementation
// that renders null as 0 has to fail, and one that renders 0 as absent too.
function harnessRow(overrides: Partial<HarnessRow> = {}): HarnessRow {
  return {
    harness: 'claude',
    interactionCount: 128,
    inputTokens: 4_210,
    outputTokens: 0,
    cacheReadTokens: null,
    cacheWriteTokens: 96_500,
    totalTokens: 100_710,
    ...overrides,
  };
}

function modelRow(overrides: Partial<ModelRow> = {}): ModelRow {
  return {
    model: 'claude-opus-4',
    provider: 'anthropic',
    interactionCount: 64,
    inputTokens: 2_105,
    outputTokens: 0,
    cacheReadTokens: null,
    cacheWriteTokens: 48_250,
    totalTokens: 50_355,
    ...overrides,
  };
}

describe('models/+page.svelte', () => {
  it('identifies the screen in the document head', async () => {
    await render(Models, {
      ...routeProps,
      data: { harnesses: [harnessRow()], models: [modelRow()] },
    });

    expect(document.title).toBe('Models & Harnesses · LLM Retro');
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toBe(
      'Your Harness mix and canonical-Model mix across all recorded activity.',
    );
  });

  it('lists every Harness column in order', async () => {
    await render(Models, {
      ...routeProps,
      data: { harnesses: [harnessRow()], models: [modelRow()] },
    });

    const harnesses = page.getByRole('region', { name: 'By Harness' });
    expect(
      textsOf(harnesses.getByRole('row').first().getByRole('cell')),
    ).toEqual([
      'Harness',
      'Interactions',
      'Input',
      'Output',
      'Cache read',
      'Cache write',
      'Total tokens',
    ]);
  });

  it('lays a Harness out under its display label', async () => {
    await render(Models, {
      ...routeProps,
      data: { harnesses: [harnessRow()], models: [modelRow()] },
    });

    const harnesses = page.getByRole('region', { name: 'By Harness' });
    expect(
      textsOf(harnesses.getByRole('row').last().getByRole('cell')),
    ).toEqual(['Claude', '128', '4,210', '0', '—', '96,500', '100,710']);
  });

  it('lists every Model column in order', async () => {
    await render(Models, {
      ...routeProps,
      data: { harnesses: [harnessRow()], models: [modelRow()] },
    });

    const models = page.getByRole('region', { name: 'By Model' });
    expect(textsOf(models.getByRole('row').first().getByRole('cell'))).toEqual([
      'Model',
      'Provider',
      'Interactions',
      'Input',
      'Output',
      'Cache read',
      'Cache write',
      'Total tokens',
    ]);
  });

  it('lays a Model out across the columns it belongs in', async () => {
    await render(Models, {
      ...routeProps,
      data: { harnesses: [harnessRow()], models: [modelRow()] },
    });

    const models = page.getByRole('region', { name: 'By Model' });
    expect(textsOf(models.getByRole('row').last().getByRole('cell'))).toEqual([
      'claude-opus-4',
      'anthropic',
      '64',
      '2,105',
      '0',
      '—',
      '48,250',
      '50,355',
    ]);
  });

  it('still draws both breakdowns when only the Harness one has rows', async () => {
    await render(Models, {
      ...routeProps,
      data: { harnesses: [harnessRow()], models: [] },
    });

    expect(page.getByRole('table').elements()).toHaveLength(2);
    expect(textsOf(page.getByRole('row').last().getByRole('cell'))).toEqual([
      'Model',
      'Provider',
      'Interactions',
      'Input',
      'Output',
      'Cache read',
      'Cache write',
      'Total tokens',
    ]);
  });

  it('swaps both breakdowns for an empty state when neither has rows', async () => {
    await render(Models, {
      ...routeProps,
      data: { harnesses: [], models: [] },
    });

    expect(page.getByRole('table').query()).toBeNull();
    await expect
      .element(
        page.getByText(
          'No Interactions have been recorded yet. Run ingestion from Jobs to populate this view.',
        ),
      )
      .toBeInTheDocument();
  });
});
