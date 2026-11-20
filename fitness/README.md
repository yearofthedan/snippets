# fitness

Architectural fitness checks for TypeScript codebases. It builds a model of the codebase (the import graph, which
kind each module is, and the rules between kinds) and reports findings against it, as text for people, JSON or SARIF
for tools, and hook responses for coding agents. `diff` reports only what a change made new or worse, so it can run after every edit.

First cut. It covers module kinds, dependency direction, re-exports across kinds, cohesion and cognitive complexity. Import counts, import
distance, orchestration weight, export surface and fan-in come later.

## Run it

Needs Node 22.18 or later.

```sh
cd fitness
pnpm install
pnpm build
pnpm link --global   # puts `fitness` on your PATH
```

Or add it to one project as a dev dependency, and run it there with `pnpm exec fitness`:

```sh
pnpm add -D link:~/src/snippets/fitness
```

In the project to check, add a `fitness.config.json`, or a `fitness.config.ts` for [custom rules](#custom-rules), next to its `tsconfig.json`, then:

```sh
fitness check                 # every finding in the working tree
fitness diff HEAD             # new or worse findings in the working tree since HEAD
fitness diff main..feature    # new or worse findings between two refs
fitness diff main...          # new or worse findings since the working tree's branch left main
```

| Flag | Effect |
| --- | --- |
| `--config <file>` | Config path. The project root is its directory. Default: the first of `fitness.config.ts`, `.mts`, `.js`, `.mjs` and `.json` in the current directory. |
| `--ruleset <name>` | Check with a [ruleset](#rulesets), a named export of a `fitness.config.ts`. Default: the default export. |
| `--print-config` | Print the config as resolved, with each kind's rules and options, and exit. Takes `--config` and `--ruleset`. |
| `--reporter <name>` | Output format, default `text`. See [Reporters](#reporters). |
| `--fail` | Exit 1 when there are findings (`check`) or new or worse ones (`diff`). Without it, both exit 0. |

## Set up a project with omp

1. **Install the CLI** from a clone of this repo. If pnpm has no global bin directory yet, run `pnpm setup` first.

   ```sh
   cd ~/src/snippets/fitness   # wherever the clone is
   git pull && pnpm install && pnpm build
   pnpm link --global
   fitness --help
   ```

   Run `pnpm build` again after each pull: the linked command runs the built `dist/`.

2. **Add `fitness.config.json`** in the directory you run omp from, next to the project's `tsconfig.json`. A starter
   for a hexagonal layout, to adjust to the project's folders:

   ```json
   {
     "exclude": ["**/*.test.ts", "**/*.spec.ts"],
     "kinds": {
       "domain": { "match": "src/domain/**", "dependsOn": [] },
       "app": { "match": "src/app/**", "dependsOn": ["domain"] },
       "adapter": { "match": "src/adapters/**", "dependsOn": ["domain", "app"] },
       "utility": { "match": "src/lib/**", "dependsOn": [] },
       "entry": { "match": ["src/main.ts", "src/index.ts"], "dependsOn": ["domain", "app", "adapter", "utility"] }
     }
   }
   ```

   Then run `fitness check` and add globs until no `unclassified` findings are left. The other findings it reports are
   the existing baseline. The omp extension only reports what an edit makes new or worse, so they need no fixing
   first. Raise or lower the [rule options](#config) where the defaults don't fit, and commit the config.

3. **Load the extension** in that project:

   ```sh
   mkdir -p .omp/extensions
   ln -s ~/src/snippets/fitness/integrations/omp/fitness.ts .omp/extensions/fitness.ts
   ```

   The link points into your clone, so keep it out of git, for example with
   `echo .omp/extensions/fitness.ts >> .git/info/exclude`. Linking it into `~/.omp/agent/extensions/` instead loads
   it everywhere; in a project without a config the run fails and the extension stays silent. Environment
   variables change what it runs, set where you start omp:
   - `FITNESS_BASE=main...` reports against where the branch left main, instead of the last commit.
   - `FITNESS_RULESET=edit` checks with a [ruleset](#rulesets) from a `fitness.config.ts`.
   - `FITNESS_COMMAND="pnpm exec fitness"` runs a project dev dependency instead of the linked command.

4. **Confirm it works.** With a clean tree, `fitness diff HEAD --reporter omp` prints nothing. Add an import that
   breaks a `dependsOn` rule, such as a domain module importing an adapter, and run it again: it prints
   `{"additionalContext": ...}` naming the import. Revert it, start a new omp session (extensions load at session
   start), and ask omp to make the same edit. Its next reply should take the finding into account.

## Config

```json
{
  "tsconfig": "tsconfig.json",
  "exclude": ["**/*.test.ts"],
  "rules": {
    "no-cross-kind-reexport": { "allow": [] },
    "module-cohesion": { "maxLines": 200 },
    "function-cohesion": { "maxLines": 40 },
    "cognitive-complexity": { "max": 15 }
  },
  "kinds": {
    "domain": { "match": "src/domain/**", "dependsOn": [] },
    "app": { "match": "src/app/**", "dependsOn": ["domain"] },
    "adapter": {
      "match": ["src/adapters/**"],
      "dependsOn": ["domain", "app"],
      "rules": { "module-cohesion": { "maxLines": 300 }, "function-cohesion": false }
    },
    "utility": { "match": "src/lib/**", "dependsOn": [] }
  }
}
```

- `kinds` are checked in the order written and the first whose `match` glob fits a file wins, so put narrow globs
  first. A kind may always import from itself.
- Every rule runs on every kind. `rules` at the top level sets options for all kinds, and a kind's own `rules`
  overrides them. `false` turns a rule off, and `true` turns it back on for a kind. The options shown are the defaults.
- Unknown keys, rules and options are refused, so a misspelling fails loudly. Limits are whole numbers of at least 1.
- `exclude` removes files from the model entirely. Declaration files are always excluded.
- The files checked are the ones the tsconfig includes. A solution-style tsconfig with only `references` is not
  followed: point `tsconfig` at a project config.

See [`fitness.config.json`](./fitness.config.json) for the config this tool checks itself with.

A `fitness.config.ts` (or `.mts`, `.js`, `.mjs`) takes the same shape as its default export. `defineConfig` types it:

```ts
import { defineConfig } from 'fitness';

export default defineConfig({
  exclude: ['**/*.test.ts'],
  kinds: {
    domain: { match: 'src/domain/**' },
    app: { match: 'src/app/**', dependsOn: ['domain'] },
  },
});
```

Node strips the types itself, so there is no build step. `fitness` in an import always means the running fitness,
installed in the project or not. The config and its rules load as ES modules: in a project whose `package.json` lacks
`"type": "module"`, name them `.mts` (Node only warns when `type` is missing, but fails on `"type": "commonjs"`).

## Custom rules

A project adds its own rules in a `fitness.config.ts`, as plugins: objects with a `rules` list, imported, never named
by path. Each plugin gets a namespace, and its rules are `namespace/id` in `rules` and in each kind's `rules`. They
go through the same option checks as the built-in rules, and two rules with the same id are refused.

Working title's application layer re-exports its ports so adapters can implement them, which lets the UI reach a port
through `application` without breaking `dependency-direction`. A rule for that, in `fitness/rules.ts`:

```ts
import { matchesGlob } from 'node:path';
import { ConfigError, type Plugin, type Rule } from 'fitness';

const noPortsThroughApplication: Rule<{ ports: string[] }> = {
  id: 'no-ports-through-application',
  docs: 'https://example.com/no-ports-through-application.md', // optional, linked from its findings
  defaults: { ports: ['src/application/ports/**'] },
  parseOptions: ({ ports, ...rest }, at) => {
    if (Object.keys(rest).length > 0) throw new ConfigError(`${at}: unknown key ${Object.keys(rest).join(', ')}`);
    if (ports === undefined) return {};
    if (!Array.isArray(ports) || !ports.every((glob) => typeof glob === 'string')) throw new ConfigError(`${at}.ports: expected globs`);
    return { ports };
  },
  check: ({ module, options }) =>
    module.imports
      .filter((edge) => edge.via && options.ports.some((glob) => matchesGlob(edge.to, glob)))
      .map((edge) => ({
        rule: 'no-ports-through-application',
        key: `no-ports-through-application:${module.file}->${edge.to}`,
        file: module.file,
        line: edge.line,
        value: edge.names.length,
        message: `${module.file} reaches the port ${edge.to} through ${edge.via}. Call a use case instead.`,
      })),
};

export default { rules: [noPortsThroughApplication] } satisfies Plugin;
```

```ts
// fitness.config.ts
import { defineConfig } from 'fitness';
import wt from './fitness/rules.ts';

export default defineConfig({
  plugins: { wt },
  rules: { 'wt/no-ports-through-application': false },
  kinds: {
    domain: { match: 'src/domain/**' },
    application: { match: 'src/application/**', dependsOn: ['domain'] },
    ui: { match: 'src/ui/**', dependsOn: ['application', 'domain'], rules: { 'wt/no-ports-through-application': true } },
  },
});
```

- A rule reads the same facts as the built-in ones, through `RuleContext`: the module's imports, units and functions,
  its kind and options, and `kindOf` for any other module. It never reads source.
- Its findings get the namespaced `rule`, and keys prefixed with the namespace. They link to the rule's `docs` when
  it has one, and to nothing otherwise.
- `defaults` and `parseOptions` are optional: without them, the rule takes no options. `wholeNumberOptions` and
  `ConfigError` are exported for writing `parseOptions`.
- Relative imports need their `.ts` extension, and an import of types alone must be `import type`: Node strips types
  without resolving them, so `import { type Rule }` would still load the module.
- For types in the editor, the project needs `fitness` in its `node_modules`: `pnpm link fitness` after
  `pnpm link --global`, or the dev dependency. Running needs neither.
- `diff`'s cache key includes the config and every file it imports outside fitness, so editing a rule redoes the base.

## Rulesets

A ruleset checks the same architecture with different rules, such as a stricter limit after each edit, while the
agent still has the code in context, than at the PR gate. It is a named export of `fitness.config.ts`: a list of the
base config and overlays, which fitness merges in order.

```ts
// fitness.config.ts
import { defineConfig, type Ruleset } from 'fitness';

const base = defineConfig({
  rules: { 'cognitive-complexity': { max: 15 } },
  kinds: {
    domain: { match: 'src/domain/**' },
    adapter: { match: 'src/adapters/**', dependsOn: ['domain'], rules: { 'module-cohesion': { maxLines: 300 } } },
  },
});

export default base;

export const edit = [
  base,
  {
    rules: { 'cognitive-complexity': { max: 12 } },
    kinds: { adapter: { rules: { 'module-cohesion': false } } },
  },
] satisfies Ruleset;
```

```sh
fitness diff HEAD --ruleset edit
fitness --print-config --ruleset edit   # the merged result, per kind
```

- An overlay sets `rules` only: at the top level, merged by rule id, and under `kinds`, merged by kind name and then
  rule id. Kinds' globs and `dependsOn`, `exclude`, `tsconfig` and `plugins` stay as the base has them, and an overlay
  that sets them is refused, as is a kind the base doesn't declare.
- For the same rule, an overlay's options merge into the base's, `false` turns the rule off, and `true` turns it on
  and keeps the base's options. After merging, the usual layering applies: defaults, then top-level `rules`, then the
  kind's.
- Rulesets are the config's named exports that are lists, so it can export other values too. An unknown name fails
  and lists the rulesets there are. A JSON config has no rulesets.
- `diff` checks both sides with the same ruleset, and each ruleset caches its own findings, so switching rulesets
  never shows up as new findings.
- No `extends` between rulesets yet: each starts from a base. Share overlays as plain constants if two need the same.

## Rules

Analysis extracts the facts once for the whole project: the import graph, with re-exports marked, each module's top-level units and the
links between them, and each function's statements and complexity. Each rule is its own module in
[`src/model/rules/`](./src/model/rules) that reads those facts for one module at a time, so it stays pure. A rule
declares its id, its default options and how to validate them, and a `check` that returns findings. Rules are looked
up in a registry, where a project's [own rules](#custom-rules) join the built-in ones.

Every finding has a `rule`, a `key` that identifies it across commits, a `value` that `diff` compares, a `message`,
`details` an agent can act on, and for built-in rules a `docs` link to the rule's page. The agent reporters list each
rule's link once after the findings, and SARIF gives it as the rule's `helpUri`.

Each rule's page says why it exists, shows code it reports and code it passes, and lists its options:

| Rule | Reports | Options |
| --- | --- | --- |
| [`unclassified`](./docs/unclassified.md) | A module that matches no kind. From the model, so it cannot be turned off. | |
| [`dependency-direction`](./src/model/rules/dependency-direction/README.md) | An import from a kind the importer's kind does not list in `dependsOn`, followed through barrels. | |
| [`no-cross-kind-reexport`](./src/model/rules/no-cross-kind-reexport/README.md) | A module that re-exports what another kind declares. | `allow` |
| [`module-cohesion`](./src/model/rules/module-cohesion/README.md) | A module over a size tripwire whose top-level code falls into unrelated groups (LCOM4). | `maxLines` |
| [`function-cohesion`](./src/model/rules/function-cohesion/README.md) | A function over a size tripwire whose statements fall into unrelated groups. | `maxLines` |
| [`cognitive-complexity`](./src/model/rules/cognitive-complexity/README.md) | A function harder to follow than `max`, by SonarSource's measure. | `max` |

Each rule is a folder in [`src/model/rules/`](./src/model/rules): the rule module, its unit tests, and its page as
the folder's `README.md`. A new rule gets a folder like these, with the same sections in its page, and a row here.

## Diff

`diff <base>[..<head>]` checks both sides with the working tree's config, so a delta reflects code changes, never
rule changes. With three dots, `<base>...<head>`, the base is where `<head>` (or the working tree's `HEAD`) left
`<base>`, as in git. A base commit where the project's tsconfig does not exist yet counts as having no findings.

A ref is checked out into a temporary git worktree that links the project's `node_modules`, and its
findings are cached under `.git/fitness-cache/` by commit, config (with the custom rules it imports) and a digest of
fitness's own code and TypeScript version, so repeated runs against the same base only analyse the head, and a linked
checkout that edits a built-in rule redoes the base. Each new entry prunes those from other builds of fitness and those
unread for 30 days. Without a head, the head is the working tree.

A finding is new when its key is absent at the base, and worse when its value rose. Findings in a renamed file or
function count as new. Function findings are keyed by name, and a callback is named after its call and a string first
argument, such as `<callback to it("saves an order")>`, so a key survives edits elsewhere in the file. Functions that
still share a name get `#2`, `#3` in order of appearance.

## Reporters

A reporter turns a check or diff result into output. Each is its own module in
[`src/app/reporters/`](./src/app/reporters), looked up by name.

| Reporter | Output |
| --- | --- |
| `text` | One line per finding, then a count. For `diff`, findings are marked `new` or `worse (was N)`. |
| `json` | `{ findings }` for `check`; `{ added, worsened, resolved }` for `diff`. Each finding has the same `message`. |
| `sarif` | SARIF 2.1.0 for GitHub code scanning: the findings to act on, with paths from the repository root. |
| `claude-hook` | A Claude Code PostToolUse hook response, or nothing when there is nothing to act on. |
| `omp` | An omp `tool_result` handler result, or nothing when there is nothing to act on. |

"To act on" means every finding for `check` and the new and worse ones for `diff`. With `--reporter claude-hook`, an
error exits 1 rather than 2, which Claude Code would treat as blocking feedback.

`diff HEAD` measures uncommitted changes, so a commit resets the baseline. To measure the whole branch instead, diff
against where it left main, `main...`, in any of the agent setups below.

### Claude Code

To have Claude Code see the delta after each edit without being blocked, add a `PostToolUse` hook to the project's
`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          { "type": "command", "command": "cd \"$CLAUDE_PROJECT_DIR\" && fitness diff HEAD --ruleset edit --reporter claude-hook", "timeout": 60 }
        ]
      }
    ]
  }
}
```

Leave out `--ruleset edit` to check with the default config, or keep it with an `edit` [ruleset](#rulesets) in the
config. Where `fitness` is a dev dependency, use `pnpm exec fitness` in the command. A non-empty delta prints a
`hookSpecificOutput.additionalContext` response, which Claude reads as context for its next
step.

### omp

[`integrations/omp/fitness.ts`](./integrations/omp/fitness.ts) is an omp extension. After each successful `edit`,
`write`, `ast_edit` or `apply_patch`, it runs `fitness diff HEAD --reporter omp` in the session's directory and returns
the result from its `tool_result` handler. omp sends a handler's `additionalContext` with the next request to the
model, outside the tool result, and the edit itself is never blocked. A failed run is left out of the context.

Install it for one project, or for every project under `~/.omp/agent/extensions/` instead:

```sh
mkdir -p .omp/extensions
ln -s ~/src/snippets/fitness/integrations/omp/fitness.ts .omp/extensions/fitness.ts
```

Set `FITNESS_BASE=main...` to diff the whole branch, `FITNESS_RULESET=edit` to check with a [ruleset](#rulesets), and `FITNESS_COMMAND="pnpm exec fitness"` when `fitness` is a
dev dependency rather than on the PATH. omp
loads extensions at session start. The event and result shapes are from `@oh-my-pi/pi-coding-agent` 18.22
(`dist/types/extensibility/extensions/types.d.ts`).

### GitHub code scanning

```yaml
permissions:
  security-events: write
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - run: fitness diff origin/${{ github.base_ref }}... --reporter sarif > fitness.sarif
  - uses: github/codeql-action/upload-sarif@v3
    with:
      sarif_file: fitness.sarif
```

Each result's `partialFingerprints` holds the finding's key, so code scanning tracks a finding across commits the
same way `diff` does.

## Compiler

Analysis uses the TypeScript 7.1 API (`typescript/sync`), pinned to `7.1.0-beta`, which runs the native compiler in a
child process. A spike confirmed it gives the AST, module resolution, and checker symbols with alias resolution, which
is what resolving through barrels needs, so ts-morph and a 5.x/6.x compiler were not needed. Each file's identifiers
are resolved in one batched checker call. The API is beta: expect to adjust when 7.1 ships.

## Limits

- Dynamic `import()`, `require()` and `import x = require()` are not edges yet.
- A namespace import (`import * as x`) points at the module the specifier resolves to, a barrel included.
- Class methods are not checked for cohesion against each other; each method gets the function rules.
