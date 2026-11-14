---
name: writing-adrs
description: Decide whether a decision needs an architecture decision record, and write or supersede one. Use whenever a decision changes the architecture, while planning a change or while building one.
---

# Writing ADRs

An ADR records why the architecture is the way it is, for someone who is about to change it. One file per decision, listed in an index.

## What the project supplies

- **Records folder.** Default: `docs/adr/`, with its index in `README.md` there.
- **Architecture doc**, if the project keeps one: each record is linked from the part it explains.

## Does it need a record?

Write one only when all three hold:

1. **There was a real alternative.** A reasonable person could have chosen differently.
2. **Reversing it is expensive.** It shapes stored data, structure, or what other code relies on.
3. **The code can't answer "why is it like this?"**

Everything else goes somewhere else:

| It is… | It goes in |
| --- | --- |
| A product decision: what the user sees, can do, or is offered | The product docs or the issue, never an ADR |
| A choice not yet proven in use, such as a library before it has met the quality targets | The change that depends on it, which writes the record once it is proven |
| A convention that is cheap to change (file names, folder names, test style) | The repo's agent instructions, or a lint rule |
| A detail of how a decision is carried out (timings, syntax, port names) | The code, a check, or a doc beside it |

## The record

File `NNNN-short-title.md` in the records folder, the next number in order. The title names the decision, not the topic ("No backend in v1", not "Storage").

```markdown
# N. Title

Status: Proposed, YYYY-MM-DD

## Context

## Decision

## Consequences
```

- **Context** describes the forces at play, such as constraints, quality targets, design principles and facts about the platform or the team, stated as facts in value-neutral language. It says where they pull against each other and names the alternatives a reasonable person could have chosen, without arguing for the outcome.
- **Decision** is the response to those forces, in full sentences and the active voice: "We will …". It is stated at the level that stays true while details change: no library names unless the decision is about that library and a change has proven it.
- **Consequences** describes the resulting context after applying the decision, positive, negative and neutral: what becomes easy, what becomes hard, and what is now ruled out.
- The record is one or two pages, written as a conversation with a future developer: full sentences in paragraphs, with bullets only for visual style, never for sentence fragments.
- Names no person and tells no story of how the decision was reached.

## After writing

- Add a row to the index.
- Link the record from the part of the architecture doc it explains, if the project keeps one.
- Re-read the record against the three tests and the table above. A record that fails one is deleted, not softened.

## Changing a decision

A record is Proposed until the change that proves it merges, and can be edited freely until then, even if the record itself merged earlier. The change that proves it sets it to `Accepted, YYYY-MM-DD`. An Accepted record is never edited. To change it, write a new record that supersedes it, set the old record's status to `Superseded by [N](NNNN-title.md)`, update the index, and repoint its links in the architecture doc.
