# Job progress streams to the UI over Server-Sent Events, not WebSockets

A Job run must show live progress in the UI — percentage complete, the file being processed now, a streaming log, and the terminal outcome. This is a **one-directional** flow: the server pushes, the client only watches. We stream it over **Server-Sent Events**, keyed by the run's correlation id, rather than WebSockets.

## Considered options

- **WebSockets** — bidirectional, but not first-class in SvelteKit's standard `adapter-node`: there is no exposed HTTP `upgrade` hook, so it requires ejecting to a custom Node server plus a matching dev-server plugin. That plumbing buys a client→server channel we do not have a use for, since user-initiated cancel is deferred.
- **Polling** — simple, but no live feel and wasteful of the open connection we already have.

## Consequences

- SSE is native under `adapter-node`: a plain streaming `GET` endpoint, no custom server, no extra dependency, browser auto-reconnect for free. It rides the single local process the solution already mandates.
- The endpoint is a thin adapter over the runner's event source, subscribed by correlation id — not a second source of truth. Because `job_run` is persisted, a page reload reattaches to an in-flight run and resumes streaming.
- The one thing SSE cannot do is carry a message *up* from the client. The moment a client→server control channel is genuinely needed — a cancel button, interactive job control — this is revisited: either a small separate `POST` or a move to WebSockets. The correlation-id topic model carries straight over, so the switch is contained.
