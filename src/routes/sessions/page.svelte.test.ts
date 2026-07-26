import { routeProps, textsOf } from '$lib/render-fixture';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Sessions from './+page.svelte';
import type { PageData } from './$types';

type SessionShape = PageData['sessions'];

// One excluded Session, not two: the singular branch is the one a plural-only
// implementation gets wrong, and the same count in both positions is what
// makes the two renderings of the note comparable.
const excludedNote = '1 Session excluded (no measurable duration).';

// A null average duration is "not measurable", never zero, so the em dash has
// to survive the trip through the screen. The excluded count is the same in
// the totals and the one Harness row, which is what makes the two renderings
// of the note comparable.
function sessions(durationExcluded = 1): { sessions: SessionShape } {
  return {
    sessions: {
      totals: {
        sessionCount: 4,
        interactionCount: 29,
        averageInteractionsPerSession: 7.25,
        averageDurationMs: null,
        durationExcluded,
      },
      byHarness: [
        {
          harness: 'claude',
          sessionCount: 4,
          interactionCount: 29,
          averageInteractionsPerSession: 7.25,
          averageDurationMs: null,
          durationExcluded,
        },
      ],
    },
  };
}

const noSessions: { sessions: SessionShape } = {
  sessions: {
    totals: {
      sessionCount: 0,
      interactionCount: 0,
      averageInteractionsPerSession: 0,
      averageDurationMs: null,
      durationExcluded: 0,
    },
    byHarness: [],
  },
};

describe('sessions/+page.svelte', () => {
  it('identifies the screen in the document head', async () => {
    await render(Sessions, { ...routeProps, data: sessions() });

    expect(document.title).toBe('Sessions · LLM Retro');
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toBe(
      'The shape of your Sessions: counts, average Interactions, and average duration by Harness.',
    );
  });

  it('lists every column in order', async () => {
    await render(Sessions, { ...routeProps, data: sessions() });

    expect(textsOf(page.getByRole('row').first().getByRole('cell'))).toEqual([
      'Harness',
      'Sessions',
      'Interactions',
      'Avg Interactions / Session',
      'Avg duration',
    ]);
  });

  it('lays a Harness out across the columns it belongs in', async () => {
    await render(Sessions, { ...routeProps, data: sessions() });

    expect(textsOf(page.getByRole('row').last().getByRole('cell'))).toEqual([
      'Claude',
      '4',
      '29',
      '7.3',
      `— ${excludedNote}`,
    ]);
  });

  it('punctuates the excluded-Sessions note the same way in both positions', async () => {
    await render(Sessions, { ...routeProps, data: sessions() });

    const [headline] = textsOf(
      page.getByText('How long you typically stay in a Session.'),
    );
    const [, , , , duration] = textsOf(
      page.getByRole('row').last().getByRole('cell'),
    );
    expect(headline).toBe(
      `How long you typically stay in a Session. ${excludedNote}`,
    );
    expect(duration).toBe(`— ${excludedNote}`);
  });

  it('leaves the note out when no Session was excluded', async () => {
    await render(Sessions, { ...routeProps, data: sessions(0) });

    expect(page.getByText('excluded (no measurable duration)').query()).toBe(
      null,
    );
  });

  it('swaps the whole body for an empty state when no Session exists', async () => {
    await render(Sessions, { ...routeProps, data: noSessions });

    expect(page.getByRole('table').query()).toBeNull();
    await expect
      .element(
        page.getByText(
          'No Sessions have been recorded yet. Run ingestion from Jobs to populate this view.',
        ),
      )
      .toBeInTheDocument();
  });
});
