# Planning

How to create and review implementation plans for this repository.

## Write self-contained plans

Write plans so they can be executed from a fresh context without further clarification.

- Record every decision as a terse bullet: the decision plus a one-line rationale, never narrative prose.
- Treat plans as ephemeral working documents. Move lasting rationale, contracts, and hard-won learnings to their durable home when the work lands; never leave them only in the plan or duplicate them in code comments.
- Describe architectural intent and module boundaries rather than relying on brittle paths or symbol names.
- Divide the work into small, ordered steps.

## Required concluding sections

End every plan with the following sections.

### Testing Decisions

- Define what makes a good test for the feature, testing external behaviour rather than implementation details.
- Name the specific modules to test.
- Identify prior art in the codebase to follow for style and tooling.

### Out of Scope

- State explicitly what the plan will not address.

### Unresolved Questions

- Record unanswered questions, edge cases, and architectural uncertainties.
- Write `None` when there are none.
