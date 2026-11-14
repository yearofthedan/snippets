---
name: lessons
description: Capture an incident when the builder stops, redirects or undoes your work, a claim is shown wrong, or you step around a refusal; assess incidents into lessons with tripwires that stop them. Use when one of those happens, or when the builder asks to assess lessons.
---

# Lessons

A lesson is something that would have saved time or caught a mistake sooner. It runs in three steps: capture an incident when it happens, assess incidents into lessons in a batch, and reflect on which lessons need a tripwire.

The record is local to this machine, in `lessons/` under the agent directory that `omp config path` prints (`~/.omp/agent` by default):

- `inbox.md`: incidents waiting to be assessed, appended to as they happen.
- `lessons.md`: the lessons, each with its incidents and tripwire.

Create either file when it is missing.

## Capture

### When to capture

Capture before you reply when the builder stopped, redirected or undid something you did; when something you stated as checked, done or decided is shown wrong, by them or by a review; or when you stepped around a refusal instead of doing what it names. Questions, requests for more information, or changes to proposals are not incidents by themselves, although they could reveal one.

### The entry

Append one entry per incident to `inbox.md`. Record what went wrong and what happened, not why it went wrong: the assessment finds the cause and the tripwire by comparing incidents.

```markdown
## YYYY-MM-DD · <repo> · <pull request, issue or session id>
- **What went wrong:** one plain sentence naming the mistake, as you would own it: "I left the door unlocked". No "because".
- **What happened:** in order: what you claimed or did, quoted; what the builder, a review or a refusal said, word for word; what you did next.
- **Impact:** who caught it, how far it got (inside the session, to the builder, into a pull request, into their work), and the rework.
- **Session:** the session file and a short quote from the message, so the assessment can read the context.
```

Record the impact as facts. Severity is set when the incident is assessed, not by the session that caused it.

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

Before setting a proposal out, test it against the incidents of its own lesson and of each lesson that pulls the other way, such as asking too little against deciding too much, or capturing too little against capturing too much. Say in one line which incidents it would stop, and which wanted behaviour it would wrongly stop.

Set the proposals out to the builder in a message of their own, with the incidents behind each one. Mark a lesson's tripwire `proposed` once they agree, and link the tripwire once it lands.
