import { getContext, setContext } from 'svelte';
import { page } from '$app/state';
import { replaceState } from '$app/navigation';

/**
 * One selectable UI variation of a prototype. Prototypes that want to compare
 * radically different looks of the same screen register a list of these; the
 * shared VariantBar (rendered once by the prototype layout) renders the
 * switcher and reflects the choice into the `?variant=` query param.
 */
export interface Variant {
	id: string;
	label: string;
	description?: string;
}

const KEY = Symbol('prototype-variants');

class VariantStore {
	variants = $state<Variant[]>([]);
	// Reactive selection. Seeded from `?variant=` for deep links; kept in $state
	// (not read live from page.url) because replaceState doesn't reactively
	// update page.url. select() still reflects the choice back into the URL.
	#selected = $state<string | null>(page.url.searchParams.get('variant'));

	/** The active variant id: the current selection when valid, else the first. */
	get current(): string | null {
		if (this.variants.length === 0) return null;
		const sel = this.#selected;
		return sel && this.variants.some((v) => v.id === sel) ? sel : this.variants[0].id;
	}

	get description(): string | undefined {
		return this.variants.find((v) => v.id === this.current)?.description;
	}

	/** Register (or replace) the variants a prototype offers. */
	set(variants: Variant[]): void {
		this.variants = variants;
	}

	/** Remove all variants — call on unmount so the bar hides for the next screen. */
	clear(): void {
		this.variants = [];
	}

	select(id: string): void {
		this.#selected = id;
		const url = new URL(page.url);
		url.searchParams.set('variant', id);
		replaceState(url, {});
	}
}

/** Called once by the prototype layout to create the shared store. */
export function provideVariants(): VariantStore {
	const store = new VariantStore();
	setContext(KEY, store);
	return store;
}

/** Called by a prototype (or its children) to read/register variants. */
export function useVariants(): VariantStore {
	return getContext<VariantStore>(KEY);
}
