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

- [`assertions`](./plugins/dev-skills/rules/assertions.md) — claims are checked against docs, a run or the repo
  before they are written down
- [`writing`](./plugins/dev-skills/rules/writing.md) — directness, concision and stated assumptions in anything
  written
- [`working-with-the-user`](./plugins/dev-skills/rules/working-with-the-user.md) — presenting decisions, waiting
  for answers, and handling corrections; main session only
- [`durable-writing`](./plugins/dev-skills/rules/durable-writing.md) — relevance, placement, and living docs versus
  dated records
- [`comments`](./plugins/dev-skills/rules/comments.md) — when a comment is allowed, and what replaces it otherwise

Skills load when a task calls for them:

- [`mutation-triage`](./plugins/dev-skills/skills/mutation-triage/SKILL.md) — classifies surviving Stryker mutants
  and removes dead branches, records noise, or writes the tests that kill them
- [`writing-adrs`](./plugins/dev-skills/skills/writing-adrs/SKILL.md) — decides whether a decision needs a record,
  and writes or supersedes one
- [`writing-docs`](./plugins/dev-skills/skills/writing-docs/SKILL.md) — how a doc page opens, which kind of doc
  content belongs in, and keeping a page on one subject

## Licence

[MIT](./LICENSE)
