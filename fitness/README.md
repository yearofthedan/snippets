# fitness

Architectural fitness checks for TypeScript codebases. It builds a model of the codebase (the import graph, which
kind each module is, and the rules between kinds) and reports findings against it, as text for people and JSON for
agents. `diff` reports only what a change made new or worse, so it can run after every edit.

First cut. It covers module kinds, dependency direction, cohesion and cognitive complexity. Import counts, import
distance, orchestration weight, export surface and fan-in come later.

## Run it

Needs Node 22.18 or later.

```sh
cd fitness
npm install
npm run build
npm link            # puts `fitness` on your PATH
```

In the project to check, add a `fitness.config.json` next to its `tsconfig.json`, then:

```sh
fitness check                 # every finding in the working tree
fitness diff HEAD             # new or worse findings in the working tree since HEAD
fitness diff main..feature    # new or worse findings between two refs
```

| Flag | Effect |
| --- | --- |
| `--config <file>` | Config path. The project root is its directory. Default `fitness.config.json`. |
| `--json` | Findings as JSON. Each finding carries the same `message` the text output prints. |
| `--hook` | `diff` only: a Claude Code hook response, or no output when nothing is new or worse. |
| `--fail` | Exit 1 when there are findings (`check`) or new or worse ones (`diff`). Without it, both exit 0. |

## Config

```json
{
  "tsconfig": "tsconfig.json",
  "exclude": ["**/*.test.ts"],
  "thresholds": { "maxLines": 200, "maxFunctionLines": 40, "maxComplexity": 15 },
  "kinds": {
    "domain": { "match": "src/domain/**", "dependsOn": [] },
    "app": { "match": "src/app/**", "dependsOn": ["domain"] },
    "adapter": { "match": ["src/adapters/**"], "dependsOn": ["domain", "app"], "thresholds": { "maxLines": 300 } },
    "utility": { "match": "src/lib/**", "dependsOn": [] }
  }
}
```

- `kinds` are checked in the order written and the first whose `match` glob fits a file wins, so put narrow globs
  first. A kind may always import from itself.
- `thresholds` at the top level apply to every kind. A kind's own `thresholds` override them. The values shown are
  the defaults.
- `exclude` removes files from the model entirely. Declaration files are always excluded.
- The files checked are the ones the tsconfig includes. A solution-style tsconfig with only `references` is not
  followed: point `tsconfig` at a project config.

See [`fitness.config.json`](./fitness.config.json) for the config this tool checks itself with.

## Rules

Every finding has a `rule`, a `key` that identifies it across commits, a `value` that `diff` compares, a `message`,
and `details` an agent can act on.

**`unclassified`**: the module matches no kind, so no other rule applies to it.

**`dependency-direction`**: a module imports a kind its own kind's `dependsOn` does not list. Named imports resolve
through barrels and re-exports to the module that declares them, so a domain module importing `../adapters` is
reported against the adapter file behind the barrel, with the barrel named as the route. Type-only imports
(`import type`, `import { type X }`, or names that only declare types) are recorded separately on the edge and still
count. There is one finding per pair of modules. Its value is the number of names imported, so importing more across
the same boundary counts as worse. When the target kind may depend on the importer's kind, the message advises a port;
otherwise it advises moving the code or allowing the dependency.

**`module-cohesion`**: LCOM4 over a module's top-level code, checked only when the module is over `maxLines`. Functions
and classes are the units. Two units are linked when one references the other, or both reference the same top-level
state or type declared in the module. Top-level statements that declare nothing count together as one unit. A module
whose units form one connected group passes at any size. Otherwise the finding lists each group's names and line range,
which is where to split.

**`function-cohesion`**: the same measure inside a function over `maxFunctionLines`. The units are the body's
statements, linked when they share a parameter, a local or a `this.<member>`. Parameters count as shared, so guard
clauses stay attached to the code they guard. Statements that touch none of these are left out. The finding lists the
groups' line ranges.

**`cognitive-complexity`**: SonarSource's cognitive complexity for each outermost function, with nested functions
counted into it. `if`, ternaries, `switch`, loops and `catch` add 1 plus their nesting depth. `else`, `else if`,
labelled jumps, each run of mixed `&&`/`||`/`??` and direct recursion add 1. The finding names the largest increments.

## Diff

`diff <base>[..<head>]` checks both sides with the working tree's config, so a delta reflects code changes, never
rule changes. A ref is checked out into a temporary git worktree that links the project's `node_modules`, and its
findings are cached under `.git/fitness-cache/` by commit, config and tool version, so repeated runs against the same
base only analyse the head. Without a head, the head is the working tree.

A finding is new when its key is absent at the base, and worse when its value rose. Findings in a renamed file or
function count as new.

## Claude Code hook

To have Claude Code see the delta after each edit without being blocked, add a `PostToolUse` hook to the project's
`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [{ "type": "command", "command": "cd \"$CLAUDE_PROJECT_DIR\" && fitness diff HEAD --hook", "timeout": 60 }]
      }
    ]
  }
}
```

With `--hook`, a non-empty delta prints a `hookSpecificOutput.additionalContext` response, which Claude reads as
context for its next step; an empty one prints nothing. The command exits 0 either way, and exits 1 on an error such as
a bad config, which Claude Code shows to the user without blocking.

`diff HEAD` measures uncommitted changes, so a commit resets the baseline. To measure the whole branch instead, diff
against where it left main: `fitness diff "$(git merge-base HEAD main)" --hook`.

## Compiler

Analysis uses the TypeScript 7.1 API (`typescript/sync`), pinned to `7.1.0-beta`, which runs the native compiler in a
child process. A spike confirmed it gives the AST, module resolution, and checker symbols with alias resolution, which
is what resolving through barrels needs, so ts-morph and a 5.x/6.x compiler were not needed. Each file's identifiers
are resolved in one batched checker call. The API is beta: expect to adjust when 7.1 ships.

## Limits

- Dynamic `import()`, `require()` and `import x = require()` are not edges yet.
- A namespace import (`import * as x`) points at the module the specifier resolves to, a barrel included.
- Class methods are not checked for cohesion against each other; each method gets the function rules.
