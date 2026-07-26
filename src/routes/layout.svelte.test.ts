import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Layout from './+layout.svelte';

// Unmocked, the page state resolves to a silently empty object in browser
// mode: the path reads as an empty string, no nav entry matches, and a test
// asserting the absence of a marking would pass while proving nothing.
vi.mock('$app/state', () => ({
  page: { url: new URL('http://localhost/models') },
}));

const children = createRawSnippet(() => ({
  render: () => '<p>Screen body</p>',
}));

describe('+layout.svelte', () => {
  it('marks the nav entry for the screen you are on', async () => {
    await render(Layout, { params: {}, data: {}, children });

    await expect
      .element(page.getByRole('link', { name: 'Models', exact: true }))
      .toHaveAttribute('aria-current', 'page');
  });

  it('leaves every other nav entry unmarked', async () => {
    await render(Layout, { params: {}, data: {}, children });

    const marked = page
      .getByRole('link')
      .elements()
      .filter((link) => link.hasAttribute('aria-current'))
      .map((link) => link.textContent);
    expect(marked).toEqual(['Models']);
  });
});
