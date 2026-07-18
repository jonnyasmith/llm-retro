import type { Action } from 'svelte/action';

/** Make a non-button element behave like a button for keyboard and assistive
 * tech: adds `role="button"` + `tabindex="0"` (unless already set) and fires the
 * handler on Enter/Space, mirroring native button activation.
 *
 * Use when the clickable element cannot be a real `<button>` — e.g. a block row
 * containing flow content, which a `<button>` may not legally wrap. */
export const clickable: Action<HTMLElement, () => void> = (node, onActivate) => {
	let handler = onActivate;

	if (!node.hasAttribute('role')) node.setAttribute('role', 'button');
	if (!node.hasAttribute('tabindex')) node.tabIndex = 0;

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handler();
		}
	}
	function onClick() {
		handler();
	}

	node.addEventListener('keydown', onKeydown);
	node.addEventListener('click', onClick);

	return {
		update(next) {
			handler = next;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			node.removeEventListener('click', onClick);
		}
	};
};
