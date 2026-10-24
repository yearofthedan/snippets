---
name: writing-docs
description: Write or restructure a doc page — how it opens, which kind of doc the content belongs in, and how the page stays on one subject. Use when creating a doc, moving content between docs, or adding a section to one.
---

# Writing docs

The durable-writing rule applies throughout; this covers what is particular to a doc page.

## How a page opens

A page in the project's docs folder states, before its first `##` heading, who it is for and what it is for:

```markdown
**Audience:** who reads this, and when.
**Purpose:** what the page gives them, in one sentence.
```

A numbered decision record is the exception: it opens as the writing-adrs skill says. Agent rules and skills open with their frontmatter instead: a rule's loading fields, a skill's `name` and `description`, which is what an agent reads to decide whether to load it.

The purpose is the test for everything below it. Content that doesn't serve the purpose belongs on another page.

## Which kind of doc

Use the project's place for each kind. Where it has none, ask before creating one.

| It is… | It goes in |
| --- | --- |
| A rule that must hold on every turn | The project's agent rules |
| What the product is for, and the principles that decide calls | The product doc |
| The shape of the system: its parts, boundaries and constraints | The architecture doc |
| Why an architecture decision was made | A decision record (writing-adrs) |
| A convention a change has to satisfy | A standard, one page per subject. It states the rule; a check that enforces it names the standard, not the other way round |
| How an agent does a repeated job | A skill |
| How something tricky works | An explainer, linked from the code or doc it explains |
| Anything local to one function | The code, or a comment the comments rule allows |

## Keeping a page whole

- One subject per page. A section that has grown its own audience becomes its own page, linked from where it was.
- Link to the page that owns a fact; don't restate it. Two copies drift, and the reader can't tell which is current.
- An index gives each entry one line saying what the page is for, enough to choose which to open. It doesn't restate what the page says, which drifts when the page changes.
