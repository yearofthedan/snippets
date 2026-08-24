# agent-standards

Standards for how coding agents work, kept tool-neutral so the same file can be
wired into any host. Each file is plain markdown with no host-specific syntax —
`@` imports, frontmatter, and config keys belong in the consuming repo, not here.

## Contents

- [`communication-standards.md`](./communication-standards.md) — how to talk to users, and how to write
  anything that outlives the conversation: commits, code comments, docs, specs, PR bodies.

## Using one in a repo

Copy the file into the repo and commit it, rather than symlinking or fetching it
at runtime. A committed copy means a fresh clone and CI both work with no setup,
and each repo's history shows what its agents were told and when.

These rules apply to every sentence an agent writes, so they have to be in
context from the start. A mechanism that loads on demand — a skill, a slash
command, an MCP prompt — will be skipped exactly when it matters.

**Claude Code** — import it from `CLAUDE.md` with `@`, not a markdown link. A
link is followed on demand; an import is expanded at session start:

```markdown
@docs/communication-standards.md
```

Verify with `/context` in a new session: the file must appear under **Memory
files**. A failed import is silent.

**OpenCode** — list it in `opencode.json`. OpenCode reads `AGENTS.md` natively
but does not expand `@` imports inside it, so the import above is invisible to it:

```json
{ "instructions": ["AGENTS.md", "docs/communication-standards.md"] }
```
