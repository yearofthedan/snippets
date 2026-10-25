---
name: lessons
description: Capture an incident when the builder corrects, steers or interrupts your work, and assess the captured incidents into lessons with tripwires that stop them. Use when a correction lands, including one phrased as a question or an aside, or when the builder asks to assess lessons.
---

# Lessons

A lesson is something that would have saved time or caught a mistake sooner. It runs in three steps: capture an incident when it happens, assess incidents into lessons in a batch, and reflect on which lessons need a tripwire.

The record is local to this machine, in `lessons/` under the agent directory that `omp config path` prints (`~/.omp/agent` by default):

- `inbox.md`: incidents waiting to be assessed, appended to as they happen.
- `lessons.md`: the lessons, each with its incidents and tripwire.

Create either file when it is missing.

## Capture

Capture when the builder corrects your work, steers it, or interrupts it, when a review finds something you claimed was done, and when a hook refuses a step. Capture straight away, before replying, rather than at hand-over: the detail is gone by then. A correction often arrives as a question ("is a 100 ms cap too strict?") or an aside ("worth noting that AA is a baseline"): it counts when your reply would concede the point. A message that only adds information is not an incident.

Append one entry per incident to `inbox.md`:

```markdown
## YYYY-MM-DD · <repo> · <pull request, issue or session id>
- **What happened:** one line, the facts.
- **Cost:** what it touched or exposed, whether anything unverified shipped, how many steers it took, the rework.
- **Would have caught it:** the check, rule or habit that would have stopped it sooner.
```

Record the cost as facts. Severity is set when the incident is assessed, not by the session that caused it.

## Assess

Run when the builder asks, or when the session-start notice says incidents are waiting. Read all of `inbox.md` and `lessons.md` first, then for each incident:

1. **Match it to a lesson.** It belongs to an existing lesson when the same principle would have caught it, however different the details. Otherwise write a new lesson: one sentence stating the principle, not the incident.
2. **Set the lesson's kind.** `practice` when it would hold in any repository, or the repository's name when it rests on that repository's code, tests or conventions.
3. **Set its severity**, by the worst consequence among its incidents:

   | Severity | Consequence |
   | --- | --- |
   | High | The builder's work or data was touched, or something unverified shipped as verified |
   | Medium | A wrong claim or result reached the builder or a pull request before it was caught |
   | Low | Time lost or rework, caught inside the session |

4. **Move the incident** under its lesson in `lessons.md` and delete it from `inbox.md`.

Then drop each incident older than 30 days, and each lesson left with none.

`lessons.md` holds one section per lesson:

```markdown
## <the principle, one sentence>
- **Kind:** practice | <repo>
- **Severity:** high | medium | low
- **Tripwire:** none | proposed | <link to the check or rule>
- **Incidents:**
  - YYYY-MM-DD · <repo> · <reference>: what happened, in one line
```

## Reflect

Straight after assessing, find the lessons that need a tripwire: each with two incidents or more, and each high-severity one from its first. A lesson whose tripwire was already in place when an incident landed needs a stronger one.

For each, propose the smallest tripwire that would have stopped every incident in its list, not only the latest:

1. A check or hook, wherever one can be written.
2. A rule or a skill change, where no check can.

A tripwire lives with what it is about. One for a `practice` lesson goes in the dev-skills plugin, and one for a repository's lesson goes in that repository. When a tripwire that was in place did not stop an incident, propose a stronger kind, such as a check where a rule failed, rather than rewording the rule.

Set the proposals out to the builder in a message of their own, with the incidents behind each one. Mark a lesson's tripwire `proposed` once they agree, and link the tripwire once it lands.
