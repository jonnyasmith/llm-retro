import type { Locator } from 'vitest/browser';

/**
 * Test support for the client project: what a rendered screen says, in the
 * order it says it.
 *
 * A table's wiring is only assertable as a sequence — a single-element check
 * catches a deleted column but stays green when two columns swap places, which
 * is the defect class the render tests exist for.
 */
export function textsOf(elements: Locator): string[] {
  return elements
    .elements()
    .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
}

/**
 * The props a page component declares beyond its loaded data. No screen reads
 * either, but every generated page prop type requires both.
 */
export const routeProps = { params: {}, form: null };
