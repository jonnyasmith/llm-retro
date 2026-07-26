import { routeProps, textsOf } from '$lib/render-fixture';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Activity from './+page.svelte';
import type { PageData } from './$types';

// Four counts under one peak of twelve, chosen to land in four different
// bands: shading that ignored the peak would collapse them onto one level.
const data: PageData = {
  timezone: 'Europe/London',
  activity: [
    { localDow: 0, localHour: 23, interactionCount: 2 },
    { localDow: 1, localHour: 9, interactionCount: 12 },
    { localDow: 1, localHour: 10, interactionCount: 9 },
    { localDow: 1, localHour: 11, interactionCount: 5 },
    { localDow: 1, localHour: 12, interactionCount: 1 },
  ],
};

const grid = page.getByRole('table', {
  name: 'Interaction counts in Europe/London',
});

describe('activity/+page.svelte', () => {
  it('identifies the screen in the document head', async () => {
    await render(Activity, { ...routeProps, data });

    expect(document.title).toBe('Activity · LLM Retro');
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content'),
    ).toBe('Interaction activity by local day of week and hour.');
  });

  it('lists every hour of the day in order', async () => {
    await render(Activity, { ...routeProps, data });

    expect(textsOf(grid.getByRole('columnheader'))).toEqual([
      'Day',
      '00',
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
    ]);
  });

  it('runs the week from Monday to Sunday', async () => {
    await render(Activity, { ...routeProps, data });

    expect(textsOf(grid.getByRole('rowheader'))).toEqual([
      'MonMonday',
      'TueTuesday',
      'WedWednesday',
      'ThuThursday',
      'FriFriday',
      'SatSaturday',
      'SunSunday',
    ]);
  });

  it('counts an hour no Interaction reached as zero', async () => {
    await render(Activity, { ...routeProps, data });

    const [, monday] = grid.getByRole('row').all();
    expect(textsOf(monday.getByRole('cell'))).toEqual([
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '12',
      '9',
      '5',
      '1',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
  });

  it('shades each hour against the busiest one', async () => {
    await render(Activity, { ...routeProps, data });

    const [, monday] = grid.getByRole('row').all();
    const levels = monday
      .getByRole('cell')
      .elements()
      .map((cell) => cell.getAttribute('data-level'));
    expect(levels[9]).toBe('4');
    expect(levels[10]).toBe('3');
    expect(levels[11]).toBe('2');
    expect(levels[12]).toBe('1');
    expect(levels[0]).toBe('0');
  });

  it('names the day, hour and count of every cell', async () => {
    await render(Activity, { ...routeProps, data });

    await expect
      .element(page.getByLabelText('Monday at 09:00: 12 Interactions'))
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText('Monday at 00:00: 0 Interactions'))
      .toBeInTheDocument();
  });

  it('keeps the complete week beside the empty-state note', async () => {
    await render(Activity, {
      ...routeProps,
      data: { timezone: 'Europe/London', activity: [] },
    });

    expect(grid.getByRole('cell').elements()).toHaveLength(7 * 24);
    await expect
      .element(
        page.getByText(
          'No Interactions have been recorded yet. The complete week is shown with zero activity until ingestion adds data.',
        ),
      )
      .toBeInTheDocument();
  });
});
