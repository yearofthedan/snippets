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

The question that had to be answered, in one sentence.

- **Short name.** One force per bullet, stated as fact.

## Options considered

| Option | Force A | Force B |
| --- | --- | --- |
| Chosen option | How it fares | How it fares |
| Other option | How it fares | How it fares |

## Decision

## Consequences
```

- **Context** opens with the question in one sentence, then lists the forces at play, each with a short bold name the options table reuses as a column: constraints, quality targets, design principles, facts about the platform or the team, and the forces the decision goes against. Options go under Options considered, and the context doesn't argue for the outcome. A reader should see why a reasonable person could land elsewhere.
- **Options considered** is a table: one row per real option, the chosen one first, one column per force. Each cell says in a few words how that option fares. A drawback with no force column is not a reason: if no column rules an option out, the context is missing a force or the option didn't lose. A record with only one row fails the first test.
- **Decision** names the chosen option and what was decided, at the level that stays true while details change. No library names unless the decision is about that library and a change has proven it. It says which forces decided it and why each other option lost, in the table's terms; where the table favours another option on a force, it says what outweighs that force. A reader with only the record should reach the same choice.
- **Consequences** states what follows, good and bad: what becomes easy, what becomes hard, what is now ruled out, and which checks enforce it.
- Names no person and tells no story of how the decision was reached.

## After writing

- Add a row to the index.
- Link the record from the part of the architecture doc it explains, if the project keeps one.
- Check the deciding force: each force the Decision says decided it favours the chosen option, in the table and in Consequences. Where either says that force favours another option, the record contradicts itself; resolve it before the record is done.
- Re-read the record against the three tests and the table above. A record that fails one is deleted, not softened.

## Changing a decision

A record is Proposed until the change that proves it merges, and can be edited freely until then, even if the record itself merged earlier. The change that proves it sets it to `Accepted, YYYY-MM-DD`. An Accepted record is never edited. To change it, write a new record that supersedes it, set the old record's status to `Superseded by [N](NNNN-title.md)`, update the index, and repoint its links in the architecture doc.
