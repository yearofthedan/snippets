# snippets

A personal collection of things I make — skills, prompts, gems, and other small bits worth
keeping around. Each lives in its own folder with whatever variants make sense for it.

## Contents

### [bias-review](./bias-review)
Critically reviews a piece of web content (article, post, paper, product page) for bias,
conflicts of interest, source quality, and reliability — arming the reader to read it
critically rather than ruling on what's true.

- [`SKILL.md`](./bias-review/SKILL.md) — Claude skill (uses `web_fetch` + web search)
- [`GEM.md`](./bias-review/GEM.md) — Gemini Gem version (Google Search only)

### [agent-standards](./agent-standards)
Standards for how coding agents work, kept tool-neutral so the same file can be wired into
any host. Copy one into a repo and commit it; see the folder README for per-tool wiring.

- [`communication-standards.md`](./agent-standards/communication-standards.md) — how to talk to users, and how to write
  anything that outlives the conversation: commits, comments, docs, specs

### [omp-notes](./omp-notes)
Tools for measuring what OMP's advisor reviewers catch and cost, from the session
transcripts on this machine. The transcripts and everything extracted from them stay local.

- [`notes.py`](./omp-notes/notes.py) — a ledger of delivered advisor notes with what happened next, session
  costs, and steers and aborts per session
- [`replay.py`](./omp-notes/replay.py) — replays past reviews on another model or brief, judged against the
  original note; [`compare.py`](./omp-notes/compare.py) lines runs up side by side
- [`briefs/`](./omp-notes/briefs) — narrow reviewer briefs tested with the replay

### [dev-skills](./plugins/dev-skills)
A plugin of development rules and skills, published from this repo's marketplace
([`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)). In omp:
`/marketplace add yearofthedan/snippets`, then `/marketplace install dev-skills@snippets`.

Rules load into every omp session. A repo replaces one with a file of the same name in its own
`.omp/rules/`.

- [`assertions`](./plugins/dev-skills/rules/assertions.md) — a claim is checked against the thing it is about, not
  a stand-in for it, before it is written down
- [`writing`](./plugins/dev-skills/rules/writing.md) — directness, concision and stated assumptions in anything
  written
- [`working-with-the-user`](./plugins/dev-skills/rules/working-with-the-user.md) — presenting decisions, waiting
  for answers, handling corrections, and saying how to check handed-over work; main session only
- [`durable-writing`](./plugins/dev-skills/rules/durable-writing.md) — relevance, placement, and living docs versus
  dated records
- [`comments`](./plugins/dev-skills/rules/comments.md) — when a comment is allowed, and what replaces it otherwise
- [`comments-tripwire`](./plugins/dev-skills/rules/comments-tripwire.md) — interrupts an edit that adds a comment
  without an allowed prefix and points the agent at `comments`
- [`start-from-what-exists`](./plugins/dev-skills/rules/start-from-what-exists.md) — find what already covers a
  test, doc, helper or rule, and add only the difference
- [`rules-in-tension`](./plugins/dev-skills/rules/rules-in-tension.md) — when two rules point different ways,
  follow what each is for, and say which gave way

`comments`' prefix list is repeated in `comments-tripwire`'s pattern and in the comment checks of repos that adopt
it. The tripwire accepts any directive or link a project might use, so a repo's check may be stricter; a prefix
added to or dropped from `comments` changes the tripwire and those checks too.

Skills load when a task calls for them:

- [`lessons`](./plugins/dev-skills/skills/lessons/SKILL.md) — captures an incident when the builder corrects,
  steers or interrupts the work, and assesses incidents into lessons with tripwires that stop them
- [`mutation-triage`](./plugins/dev-skills/skills/mutation-triage/SKILL.md) — classifies surviving Stryker mutants
  and removes dead branches, records noise, or writes the tests that kill them
- [`writing-adrs`](./plugins/dev-skills/skills/writing-adrs/SKILL.md) — decides whether a decision needs a record,
  and writes or supersedes one
- [`writing-docs`](./plugins/dev-skills/skills/writing-docs/SKILL.md) — how a doc page opens, which kind of doc
  content belongs in, and keeping a page on one subject

Extensions run in every omp session, declared in the plugin's [`package.json`](./plugins/dev-skills/package.json):

- [`lessons`](./plugins/dev-skills/extensions/lessons.ts) — when a reply settles after the builder steered or
  interrupted, asks the main session to capture an incident or carry on; at session start, says when incidents
  are waiting to be assessed. The record stays on the machine, in `lessons/` under the agent directory.

`node --test plugins/dev-skills/extensions/` runs the extensions' tests.

## Licence

[MIT](./LICENSE)
