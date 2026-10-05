# Classify before rewriting

A story is a planning-sized reminder of functionality valuable to a **user or purchaser**. Its short statement starts a conversation; agreed acceptance evidence confirms the outcome. A developer may be the genuine user of a developer-facing product. Use the form that communicates the need rather than recasting every item as a story:

| Kind | Recognition and handling |
| --- | --- |
| Story | A distinct beneficiary outcome can be prioritized, delivered, and observed. State the goal; keep settled decisions accessible without making the story a full specification. |
| Epic | A valuable but distant or oversized outcome. Keep it broad until a planning decision needs smaller outcomes. |
| Task or spike | Implementation or investigation without its own delivered product outcome. Associate it with the goal it enables; timebox a technical investigation and identify what must be learned. |
| Constraint | A policy, quality, or condition governing several stories or the system. Give it a scope and a way to check it where possible; retain a binding technology choice rather than inventing a user benefit. |
| Acceptance check | A condition and observable result that establishes part of an outcome. Attach it to the story or constraint; a new, independently valuable outcome may instead warrant its own story. |

A defect can retain its bug-report form (observed versus expected behavior). A design guide or external-system interface agreement can hold details better expressed there, linked to affected stories. For distributed teams or traceability needs, retain decisions and links to evidence beyond the short story text.

## INVEST as diagnosis

Ask whether a story is independently schedulable, negotiable where choices remain open, valuable to an actual user or purchaser, estimatable by this team, small enough for its **planning horizon**, and testable by observation. Use a weak answer to locate the relevant conversation or repair, not to calculate a score. Dependencies can be real; binding constraints remain binding; distant epics need less detail; human observation can provide evidence when automation cannot. See [reviewing](reviewing.md) for repairs and [context](context.md) for planning decisions.
