# The Connection owns every route to the Store, behind one named unsafe escape

The Connection is the single process-wide route to the Store (domain: Connection), opened at import and held for the life of the process. It publishes exactly what a caller may do with it — the queryable client, where the Store's file lives, `close()`, and `assertConnected()` — plus one property, `unsafeSqlite`, that hands back the raw SQLite driver. The driver is otherwise private: it is no longer a property of the application singleton, so reaching around the Connection is a deliberate, greppable act rather than the path of least resistance.

`assertConnected()` returns nothing and throws when a query cannot reach the Store. That is precisely what the health endpoint means by `database: 'connected'` — it discards the row and cares only that the query did not throw — so the endpoint now asks the Connection instead of composing SQL of its own.

The two types that describe the Connection live here with it: the Drizzle client over this schema, and one transaction over that client. Both are spelled from Drizzle's own types rather than inferred back out of the open function, so reshaping what the Connection returns cannot silently change what either type means.

This discharges ADR-0006's WAL guarantee, which that decision published without saying where it is enforced: WAL is set when the Connection is opened, and it stays assertable because `unsafeSqlite` keeps the journal-mode pragma reachable from a test.

## Considered options

- **A method per raw need** — a journal-mode reader, a migrations probe, a trigger installer. Rejected: the list grows with every test that wants to look at the schema, and each method is shallower than the SQL it wraps.
- **A scoped inspection callback** that lends the driver for the duration of a call. Rejected: it buys nothing here, because the Connection is a singleton with no lifetime to scope.
- **A separate inspection-only open function** for tests. Rejected: it would make tests exercise a construction path production never runs, which is the one property the bootstrap test exists to check.
- **Routing the health endpoint through the escape** rather than giving the Connection an assertion duty. Rejected: it would leave the only production reach-through intact and forfeit the whole locality win.
- **`ping()` as the name of the assertion duty.** Rejected: the word appears nowhere in this tree or its docs, whereas the endpoint already ships "connected".

## Consequences

- **`close()` has no production caller, and that absence is deliberate.** Nothing closes the Connection today: it is held for the process's life, and SQLite in WAL mode is crash-safe. Adding a shutdown hook to manufacture a caller is a separate decision needing its own justification. The duty earns its place by naming what sixty-one test teardowns were doing through the driver.
- **Every remaining raw-SQL reach-through is one search away.** `unsafeSqlite` is the only door, and the word in its name puts the cost at the call site rather than only in this document. A new use of it is a signal that the Connection is missing a duty — that is the question to ask before adding one.
- **The escape is part of the interface, not residue.** ADR-0006 publishes WAL as a guarantee, so it has to stay assertable; a schema-shape or migration-shape test needs arbitrary SQL by nature, and the Connection does not grow a bespoke method for each one.
