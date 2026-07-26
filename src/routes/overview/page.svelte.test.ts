import { routeProps, textsOf } from '$lib/render-fixture';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Overview from './+page.svelte';
import type { PageData } from './$types';

const recorded: PageData = {
  totals: { interactionCount: 128, totalTokens: 100_710 },
};
const nothingRecorded: PageData = {
  totals: { interactionCount: 0, totalTokens: 0 },
};

describe('overview/+page.svelte', () => {
  it('identifies the screen in the document head', async () => {
    await render(Overview, { ...routeProps, data: recorded });

    expect(document.title).toBe('Overview · LLM Retro');
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toBe('Headline Interaction and token usage totals.');
  });

  // Every sibling screen hides its body behind the empty state. This one keeps
  // the headline totals and appends the note; the divergence is deliberate and
  // recorded in ADR-0014, so a test has to hold it in place.
  it('keeps the headline totals beside the empty-state note', async () => {
    await render(Overview, { ...routeProps, data: nothingRecorded });

    expect(textsOf(page.getByRole('article'))).toEqual([
      'Interactions 0 User-initiated work that received a Model response.',
      'Total tokens 0 Main and sub-agent usage across every canonical token bucket.',
    ]);
    await expect
      .element(
        page.getByText(
          'No Interactions have been recorded yet. Run ingestion from Jobs to populate this overview.',
        ),
      )
      .toBeInTheDocument();
  });
});
