/**
 * What the Raw archive form's path field means. An empty field is no path at
 * all, which the Settings write path spells `null` — not a path that happens
 * to be the empty string.
 */
export function archivePathFrom(value: string): string | null {
  const path = value.trim();
  return path.length === 0 ? null : path;
}
