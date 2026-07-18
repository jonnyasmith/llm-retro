// Prototypes render client-only so throwaway UI never has to be SSR-safe and
// browser-only deps (echarts) stay out of any server render. The dev-only
// access guard lives in hooks.server.ts (it must hard-404 the document too).
export const ssr = false;
