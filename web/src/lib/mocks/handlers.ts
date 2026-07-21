import { controlPlaneHandlers } from '$lib/features/control-plane';

/**
 * The global happy-path mock network. Each feature's handler set composes here
 * and is the single source of truth reused by Storybook, the mock-mode
 * application, and Vitest.
 */
export const handlers = [...controlPlaneHandlers];
