# ESLint consults the type checker, and three exclusions say where it must not

`svelte-check` answers whether the types are _wrong_. It cannot answer the lint-shaped questions type information makes askable: a promise nobody awaits, an `any` leaking out of `JSON.parse`, a method reference that will lose its `this`. The syntactic tier we ran could not either, so those rules were simply off. We adopt **`recommendedTypeChecked` with `projectService: true`**, which turns them on.

The case for it is one finding, not a count. Measured against the tree before adoption, the tier reported 37 problems; 30 sat in tests and described test ergonomics rather than product risk. The one that said something a reader could not already see was `unbound-method` on the Job execution observer — the interface declared `progress` and `log` as _methods_, so it permitted a class-based implementation, while the backend forwards both as bare references and would drop `this` on the first call. Both that interface and the pi grammar's `discloseSubagents` are now function-typed properties: the rule went quiet as a consequence of the contract becoming honest, which is the only reason worth silencing a rule for. Everything else the tier found was fixed at the site.

Three exclusions, each for a different reason:

- **`require-await` is off everywhere.** All 13 occurrences were `async` used deliberately to satisfy a Promise-returning contract the rule cannot see — an `AsyncIterator`'s `return`, an implementation of an exported async function type. It has no true positive in this codebase, and a rule whose every hit is wrong will not be believed when it is right.
- **The `no-unsafe-*` family is off in `*.test.ts` and `*-fixture.ts`.** Reading an untyped response body or a JSON fixture is what a test does. Note what stays on there: `no-floating-promises`, `await-thenable` and `unbound-method` are as valuable in a test as in production — a floating promise in a test is a test that asserts nothing.
- **`.svelte` files get `disableTypeChecked`.** `svelte-check` type-checks components with the real compiler, which sees more than these rules do through the ESLint parser. Type-aware linting there would need extra parser wiring to overlap coverage we already have.

## Consequences

- **`pnpm lint` roughly doubles**, from about 4s to about 7.5s, because the checker now runs. Both numbers are noise next to the rest of the gate.
- **A file outside `tsconfig.json` cannot be type-checked, and pretending otherwise is worse than excluding it.** `drizzle.config.ts`, `eslint.config.js` and `svelte.config.js` are excluded by name. Routing them through `allowDefaultProject` instead was tried and rejected: without a real program the checker types `import.meta.dirname` as an error type, so the config file reported an unsafe assignment against itself.
- **`no-unnecessary-type-assertion` is not always right.** It flagged `disposition: 'started' as JobDisposition` in a hoisted test double; removing the assertion widened the property to `string` and broke the type check. Annotate the receiver rather than deleting the assertion when this rule and `tsc` disagree.
