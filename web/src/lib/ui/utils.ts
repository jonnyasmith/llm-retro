/** Join truthy class fragments into a single className string.
 *
 * The scoped-CSS analogue of shadcn's `cn()`: primitives compose their own base
 * class with a consumer-supplied `class` prop so callers can extend styling.
 * No tailwind-merge is needed — we don't emit conflicting utility classes; the
 * variant surface lives in `data-*` attributes resolved by scoped CSS. */
export function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
