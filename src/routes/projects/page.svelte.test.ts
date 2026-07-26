import { routeProps, textsOf } from '$lib/render-fixture';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Projects from './+page.svelte';
import type { PageData } from './$types';

type Project = PageData['projects'][number];

// An absent bucket sits beside a genuine zero on purpose: an implementation
// that renders null as 0 has to fail, and one that renders 0 as absent too.
function project(overrides: Partial<Project> = {}): Project {
  return {
    projectId: 1,
    rootPath: '/work/alpha',
    gitRemoteUrl: 'git@github.com:acme/alpha.git',
    interactionCount: 128,
    inputTokens: 4_210,
    outputTokens: 0,
    cacheReadTokens: null,
    cacheWriteTokens: 96_500,
    totalTokens: 100_710,
    ...overrides,
  };
}

describe('projects/+page.svelte', () => {
  it('identifies the screen in the document head', async () => {
    await render(Projects, { ...routeProps, data: { projects: [project()] } });

    expect(document.title).toBe('Projects · LLM Retro');
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toBe('Every Project ranked by how much work it absorbed.');
  });

  it('lists every column in order', async () => {
    await render(Projects, { ...routeProps, data: { projects: [project()] } });

    expect(textsOf(page.getByRole('row').first().getByRole('cell'))).toEqual([
      'Project',
      'Interactions',
      'Input',
      'Output',
      'Cache read',
      'Cache write',
      'Total tokens',
    ]);
  });

  it('lays a Project out across the columns it belongs in', async () => {
    await render(Projects, { ...routeProps, data: { projects: [project()] } });

    expect(textsOf(page.getByRole('row').last().getByRole('cell'))).toEqual([
      '/work/alpha git@github.com:acme/alpha.git',
      '128',
      '4,210',
      '0',
      '—',
      '96,500',
      '100,710',
    ]);
  });

  it('names only the root path when a Project has no git remote', async () => {
    await render(Projects, {
      ...routeProps,
      data: {
        projects: [
          project({ projectId: 2, rootPath: '/work/beta', gitRemoteUrl: null }),
        ],
      },
    });

    expect(textsOf(page.getByRole('row').last().getByRole('cell'))[0]).toBe(
      '/work/beta',
    );
  });

  it('swaps the table for an empty state when nothing has been recorded', async () => {
    await render(Projects, { ...routeProps, data: { projects: [] } });

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
