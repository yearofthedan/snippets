# Design: archetypes

Status: proposal. No code changes yet.

## Summary

Fitness today classifies files with `kinds`: a flat list of globs, the first match wins. This design replaces them
with **archetypes**: unit types that nest, so a config describes the codebase as a tree of modules rather than a
list of folders. It also widens the rule contract so rules can see whole units and the whole graph, not one file
at a time.

The result is one model of the codebase's modules. Lint checks code against it, and agents query it before writing
code.

## Vision and scope

Fitness is a declared model of a codebase's modules, used to keep it modular. It has four parts, with the model at
the core:

- **The model:** the units, what each may depend on, and what each exposes.
- **Architecture boundaries:** direction, surfaces, re-exports, cycles, external packages.
- **Modularity:** measures of a unit, such as cohesion, size, fan-in, and export surface and use.
- **Code quality:** the complexity and cohesion checks that exist today. They stay.

What's in:

- Every file in the tsconfig's program, tests included. Test code is modelled like any other code
  ([Tests](#tests)).
- Cycles between units and between files.
- The external packages a unit may import.
- Non-TS files that code imports (CSS, JSON, SVG), as members of units that edges can point at.

What's out:

- General lint rules, such as style and correctness. oxlint and Biome cover those.
- Architectures that aren't laid out in folders or file names ([open questions](#open-questions)).

## Principle

A smell in the config is often a smell in the project structure. When something is hard to express, check the
structure before adding a config feature. The examples under [Validation](#validation) show this: most of what fits
badly points at a file in the wrong place.

## Why kinds aren't enough

A flat list of globs can't say:

- a component reaches another component only through its render file;
- a component nests inside another, and the inner one is private to it;
- `dom` files hold no logic, and that rule belongs to components, not to a global list;
- the same shape repeats across projects, so it should be reusable.

And the rule contract hands a rule one module at a time (`RuleContext.module`), so rules that need the whole graph,
such as fan-in, export use, export surface and repeated call sequences, can't be written.

## The model

Seven terms, in the order they depend on each other:

| Term | What it is | Example |
| --- | --- | --- |
| **Archetype** | A reusable unit type. It says how its instances are found, what they expose, which file roles they have, and which slots they contain. | `component`, `hexagon` |
| **Slot** | A named place inside a parent archetype, filled by an archetype. Consumers depend on its surfaces by handle. | `ui`, `domain`, `components` inside `ui` |
| **Unit** | An instance of a slot in the code: a folder or a group of files. Its id is its path. | `src/ui/graph` |
| **Role** | A file's purpose within its unit, given by its name. Roles are declared once, matched by archetypes, and given extra reach with `.with()`. A file has one role. | `test`, `dom`, `dsl` extends `test` |
| **Edge** | One import between two files, as analysis resolved it. The rule contract calls a file a module. | `graph.ts` → `card.dom.ts` |
| **Rule** | A check over files, units or the whole graph, against the model. It reports findings. | `dependency-direction` |
| **Query** | A question asked of the model rather than of the code's findings. | `fitness where <file>` |

How they relate:

```
config                         code
──────                         ────
archetype ──used by──► slot ──resolves to──► unit ──contains──► files (each with a role)
                        │                                          │
                        └── surfaces, dependsOn, externals     roles, with .with() grants
                                                                   │
                                                                   ▼
                                                    edges between files
                                                                   │
                          rules judge edges and units against the slots ──► findings
                          queries read the same model ──► answers for agents
```

An archetype is a type and a slot is a use of it, the way a class is used by a field. The same `component`
archetype fills the `components` slot in `ui` and, through `self`, the `subcomponent` slot in each component. A slot's
settings (`dependsOn`, `externals`, `rules`) belong to that place in the tree, so one archetype can be used in two
places with different neighbours.

## Config

A config is built with typed builders, in the style of zod, and the builders return plain data.

```ts
import { defineConfig, f } from 'fitness';

// Roles are declared once and used by any archetype.
const test = f.role({ files: '**/*.test.ts' });
const dom = f.role({ files: '**/*.dom.ts' });

const component = f.archetype('component', (s, self) => ({
  identify: { marker: '{name}.dom.ts' },
  surface: { render: ['{name}.dom.ts'] },
  roles: { dom, test },
  rules: { 'logic-not-on-the-dom': f.deny({ from: { roleNot: [dom, test] }, to: dom }) },
  slots: {
    subcomponent: f.slot({ dir: '{name}', use: self }),
  },
}));

const app = f.archetype('app', (s) => ({
  roles: {
    test: test.with({ dependsOn: [s.testRunner] }),
    dom,
  },
  slots: {
    domain: f.slot({ dir: 'src/domain', externals: [] }),
    application: f.slot({ dir: 'src/application', dependsOn: [s.domain], externals: [] }),
    components: f.slot({ dir: 'src/ui/{name}', use: component, dependsOn: [s.application] }),
    testRunner: f.slot({ dir: 'src/test-helpers', dependsOn: [s.domain, s.application] }),
  },
}));

export default defineConfig({ root: app, rules: { 'cognitive-complexity': { max: 15 } } });
```

Read it as: the project holds a domain, an application, some components and a test runner. A component is a folder
under `src/ui/` that holds `<folder>.dom.ts`, which is its `render` surface; its other files are private. A
component may import the application, and holds the components it renders, whose `render` files it reaches. Only
test files may import the test runner, and inside a component only `dom` and test files may import a `dom` file.

**Archetypes.** `f.archetype(name, (s, self) => spec)`. Settings sit at the top of the spec, and every key under
`slots` is a slot, so a slot's name can never collide with a setting.

**Handles.** `s` holds a handle for each of the archetype's slots, by name, and `self` is the archetype being
defined, for recursion. `s.domain` stands for the domain's whole surface, and `s.components.render` for one named
surface. A handle is a placeholder resolved after the spec is built, so a misspelt `s.domian` is a type error.

**Slots.** `f.slot({ dir, files, use, dependsOn, externals, rules })`. The key is the slot's name, and `dir` or
`files` says where its units are.

**Surfaces.** What a unit lets others import. An archetype declares one surface as a list of globs, or several
named ones: `surface: { render: ['{name}.dom.ts'], testing: ['{name}.dsl.ts', '{name}.harness.ts'] }`. A file in no
surface is private to its unit. A unit with no surface declared exposes everything. A surface can include a child
slot's surface by handle, `render: [s.components.render, s.icons]`, which is how a parent passes its children's
files on; without that, children stay private to their parent.

**Reach is granted by the consumer.** `dependsOn` lists the surfaces a slot's units may import. Nothing on the
target side grants or refuses reach: the target only decides what is on its surfaces.

**Roles.** `f.role({ files, extends, externals, rules })` is declared once, at the top of the config. An archetype
lists the roles it matches in `roles`. A parent that can see a target grants a role extra reach with `.with()`:
`test.with({ dependsOn: [s.testRunner] })` lets test files anywhere below `app` import the test runner. A role is
identified by its object: every `.with()` of `test` is still `test`, and a file's role carries the
grants of every `.with()` on its chain of archetypes, merged. `extends` makes a role a kind of another, so
`dsl: f.role({ files: '**/*.dsl.ts', extends: test })` gets every grant `test` gets.

**Rules.** One `rules` key in four places: global (`defineConfig`), archetype, slot and role. A built-in rule is
configured by id. A rule defined inline is given by value under a local name, and a local name that shadows a
built-in id is refused:

```ts
rules: {
  'module-cohesion': { maxLines: 300 },                            // built-in, by id
  'dsl-not-on-a-driver': f.deny({ from: dsl, to: driver }),        // inline, by value
  'dsl-on-the-contract': f.requires({ from: dsl, to: driverContract }),
}
```

**Plain data.** The builders return data, and handles become slot paths once resolved. `--print-config` prints the
resolved model with every default filled in; `match` functions and plugin rules are the only code left in it.
Finding keys and the diff cache hash that data.

### Types

```ts
interface ArchetypeSpec {
  identify?: { marker: string } | { match: (dir: string, chain: UnitView[]) => false | Record<string, string> };
  surface?: SurfaceEntry[] | Record<string, SurfaceEntry[]>;   // unset: everything is exposed
  roles?: Record<string, Role>;  // roles it matches, optionally with grants from .with()
  slots?: Record<string, Slot>;
  externals?: string[];
  loose?: 'allow' | 'deny';      // own files outside any slot; default 'allow', the root defaults to 'deny'
  rules?: RuleSettings;
  description?: string;          // for agents choosing where code goes
}

type SurfaceEntry = string | Handle;   // a glob over the unit's own files, or a child slot's surface

interface SlotSpec {
  dir?: string | string[];       // relative to the parent unit; may hold {captures}: 'ui/{name}'
  files?: string | string[];     // a group of files, one unit: ['main.ts', 'app.ts'], '*.ts'
  use?: Archetype;               // default: an archetype with nothing inside
  dependsOn?: Handle[];          // surfaces its units may import; default []
  externals?: string[];          // packages it may import: [] none, ['*'] any, globs; unset adds no limit
  cycles?: 'allow';              // tolerate a known cycle among its siblings
  rules?: RuleSettings;
  description?: string;
}

interface RoleSpec {             // f.role(spec); role.with({ dependsOn, externals, rules }) adds grants
  files: string | string[];
  extends?: Role;
  externals?: string[];
  rules?: RuleSettings;
}

// 'off' is shorthand for { '*': false }: every rule off at that level, any listed beside '*' back on
type RuleSettings = 'off' | Record<string, boolean | object | InlineRule>;   // InlineRule from f.deny or f.requires

interface FitnessConfig {
  root: Archetype;
  tsconfig?: string;             // default 'tsconfig.json'; its program is what fitness reads
  plugins?: Record<string, Plugin>;
  rules?: RuleSettings;
}
```

A `dir` without a placeholder is one unit; with one, it is a unit per match, and a list of dirs is a unit per
entry. `files` is always one unit. A slot's `dir` or `files` says where to look, and its archetype's `identify`, if
it has one, says which of those folders count: `dir: '{name}'` with `marker: '{name}.dom.ts'` takes only folders
that hold their own `.dom.ts`.

## Finding units

1. The root unit is the config's folder.
2. For each unit, each slot finds its instances among the unit's own files and folders. A marker matches the
   shallowest folder. Deeper matches are found when fitness looks inside that unit, if its archetype has a slot
   that finds them.
3. A file belongs to its deepest unit.
4. A file has exactly one role, the most specific one that matches it.
5. A file left among the own files of a unit with `loose: 'deny'` is `unclassified`, as today.

**Most specific wins.** Line order in the config never matters.

- Slots under one parent: a literal segment beats a placeholder, which beats `**`. `ui/strings` beats `ui/{name}`,
  so `strings` isn't taken as a component.
- Roles in one archetype: the longer literal suffix wins. `*.component.test.ts` beats `*.test.ts`, which beats
  `*.ts`.
- `extends` is an explicit signal: where a role and one it extends both match, the extending role wins, so a
  `harness` role that extends `test` takes any file both globs match.
- Equal specificity is a config error that names both candidates and suggests narrowing a glob or adding `extends`.
  `*.dsl.ts` against `card.*` is one.
- Across levels, structure decides: a role in a nearer archetype beats one further out, as an inner name shadows an
  outer one.

Finding units reads the file system, so a marker can be a file outside the TS program, such as `component.json`.

**Captures.** `{name}` matches one path segment. An archetype's templates (`marker`, `surface`) see only the unit's
own captures, so nested components each have their own `{name}`. A `match` function gets the whole chain for
anything else. Unit ids are full paths, so queries identify units without captures.

**What counts as a file.** The tsconfig's program: TS, JS with `allowJs`, and Vue, Svelte, Astro or MDX through
TypeScript 7.1's `contentMappers`, which a project opts into because they run external code. A plain asset that
code imports (CSS, JSON, SVG) joins the unit whose folder holds it. It can be the target of an edge, and surfaces
apply to it, but nothing is analysed inside it. Facts come from fact sources (today, the TS analysis), so another
source, such as CSS's own `@import`s, can add edges later without touching rules.

**Generated files.** Generated code is a role or slot with its rules off:
`generated: f.slot({ dir: 'src/generated', rules: 'off' })`, or `rules: { '*': false, 'unit-cycle': true }` to keep a
few. It stays a normal node: its importers are judged by their own rules (reach, externals), and
it counts in fan-in, cycles and queries. Only findings located in it are silenced.

## Edges

Analysis already resolves each import to the module that declares the names, through barrels and re-exports, and
records `via`, whether it is type-only, and whether it is a re-export. Two additions:

- **External edges:** an import of a package or a `node:` module is kept as an edge with `external: '<package>'`.
- **Assets:** an import of a CSS, JSON or SVG file is an edge to that file.

### How an edge is judged

Privacy belongs to the target, reach to the consumer. An edge from file A to file B passes when B is within A's
reach and every inline rule that applies to A passes. A's reach is:

- **its own unit:** every file in it;
- **its children:** the surfaces of the units its unit directly contains, since a parent builds itself from its
  children;
- **its slots' grants:** the surfaces listed in `dependsOn` by the slot of every unit on A's chain;
- **its role's grants:** the surfaces listed by every `.with()` of A's role on A's chain, and of the roles it
  extends.

A surface reaches only what it lists. `s.ui.render` holds the files `ui` puts in `render`, and through
`s.components.render` the components' render files, but nothing private to any of them. A child reaches its
parent's own files only if they are listed: give them a `files` slot and depend on it.

Grants add up along the chain, and only inline rules take reach away. `externals` work the other way: an external
edge must be allowed at every level of A's chain that sets them, and a role's `externals` count as part of each
level's list. Entries are package names or globs (`node:*`, `@aws-sdk/*`). Unset means that level adds no limit, so
a list applies to the slot's whole subtree and a child can only narrow it. The canonical case is a hexagon where
only `adapters` may import packages.

**Inline rules.** `f.deny({ from, to })` forbids edges between selected files, and `f.requires({ from, to })`
reports a file matching `from` that has no edge to `to`. Selectors are roles, slot handles, or
`{ role, roleNot, in, notIn }` built from them.

**Thresholds resolve nearest first.** For a rule's options: the file's role, then its slot, then each archetype from
the innermost out, then the global `rules`, then the rule's defaults. Options resolve for the file a finding is
reported on, so a project can set different thresholds for tests and code, or for ui components and utilities.

**Edge kinds.** Edges record whether they are type-only and whether they re-export. Rules where type imports change
the answer take `types: 'count' | 'ignore'`: `dependency-direction`, `unit-externals` and both cycle rules.
Re-exports have their own rule.

**Cycles.** `unit-cycle` builds, for each unit, the graph of edges between its children, and reports each loop, so
two layers that import each other are a cycle even when no pair of files is. `no-cycle` does the same over files.
Each reports one finding per edge in a loop, keyed `unit-cycle:src/ui->src/application` or `no-cycle:a.ts->b.ts`,
so a loop that grows only adds findings. Type-only edges are ignored by default because they don't load at run
time. A slot with `cycles: 'allow'` tolerates a known loop among its siblings, and `where` shows it as tolerated.

### Rules that judge the model

Each failure is one finding per file pair per rule.

| Check | Rule id |
| --- | --- |
| B outside A's reach (details say whether B is private or just not granted) | `dependency-direction` |
| an inline rule | its local name |
| re-exporting another unit's names | `no-cross-unit-reexport` (`allow` takes slot handles) |
| a package the unit may not import | `unit-externals` |
| a loop between units | `unit-cycle` |
| a loop between files | `no-cycle` |
| a file in no unit | `unclassified` |

## Tests

Test code is code, and the model treats it that way: test files belong to units, have roles, and obey reach and
externals like everything else.

- A test file belongs to the unit it sits in, which is normally the unit it tests. That's how it reaches the unit's
  internals: they are in the same unit.
- "Test" is a role. The archetype that can see the test runner and the components' test-facing surfaces grants
  them to `test`: `test.with({ dependsOn: [s.ui.testing, s.testRunner] })`. App code has no such grant, so it can't
  reach them.
- Roles that extend `test` (languages, harnesses, test pages, drivers) get the same grants.
- A component's test-facing files form a named surface, `testing`, beside `render`.
- A test tree kept apart from the code (fitness's own `test/`) is its own slot, and its tests go through the
  surfaces of what they test.

## Rule contract

```ts
interface Rule<O extends object = object> {
  id: string;
  docs?: string;
  defaults?: O;
  parseOptions?: (raw: Record<string, unknown>, at: string) => Partial<O>;
  scope?: 'module' | 'unit' | 'project';   // default 'module'
  phase?: 'edit' | 'commit';              // default 'edit'
  check(context: ModuleContext<O> | UnitContext<O> | ProjectContext<O>): Finding[];   // narrowed by scope
}

interface ModuleContext<O> { module: ModuleFacts; unit: UnitView; role?: string; options: O; model: ModelView }
interface UnitContext<O>   { unit: UnitView; modules: ModuleFacts[]; options: O; model: ModelView }
interface ProjectContext<O> { project: Project; model: ModelView; optionsFor(file: string): O | undefined }

interface ModelView {
  units(): UnitView[];
  unitOf(file: string): UnitView | undefined;
  roleOf(file: string): string | undefined;
  verdict(edge: ImportEdge): Verdict;     // the structure decision, so custom rules can reuse it
  importersOf(file: string): ImportEdge[];  // reverse index, built once
  exportsOf(file: string): ExportFacts[];
}

interface UnitView {
  id: string;                 // its path: 'src/ui/graph'
  slot: string;               // slot path: 'ui.components'
  archetype: string;
  captures: Record<string, string>;
  parent?: UnitView;
  children: UnitView[];
  ownFiles: string[];
  surfaces: Record<string, string[]>;   // resolved files per named surface; 'default' for an unnamed one
}
```

- A project rule runs once and looks up options per file with `optionsFor`. `undefined` means the rule is off for
  that file. Export use counts the importers of every export, then asks `optionsFor` for the file that declares it.

**New facts**

| Fact | For |
| --- | --- |
| `ImportEdge.external` | `unit-externals` |
| `ModuleFacts.exports: { name, line, typeOnly, from? }[]`, `from` for re-exports | export surface (#5), export use (#6) |
| `FunctionFacts.calls: { callee, line }[]`, in order, the callee as the checker's symbol key | chained use (#4a), repeated call sequences (#4b) |

**Phase.** A rule declares the earliest point at which its findings mean something. An export with no importers is
normal halfway through a change, so `export-use` is `phase: 'commit'`, and per-file rules stay `edit`.
`fitness diff --phase edit` skips commit-phase rules, and the omp hook passes it. `check` and plain `diff` run
every rule. A config can change a rule's phase with the reserved option `phase`, and so can a ruleset. Phase is
what the rule knows about itself; rulesets stay the project's tuning.

## Finding keys

Diff matches findings by key, so a key must survive edits that don't change the finding.

- The form is `rule:subject[->object]`. A subject or object is a path, `path#symbol`, `path#Class.method`, or a unit
  id.
- Keys hold only paths, symbols and unit ids. Slot and archetype names, line numbers, declaration positions and
  option values stay out, so renaming a slot or moving code within a file leaves keys alone.
- An anonymous function is named by the function around it and the call it's passed to, `src/a.ts#load>then(0)`,
  with a `#n` suffix only when two such names are identical.
- Unit findings key on the unit id (`module-count:src/ui/graph`), and project findings on their subject
  (`export-use:src/x.ts#foo`).
- Before comparing, `diff` maps base keys through git's renames (`git diff -M --name-status`), so a moved file's
  findings carry over instead of showing as resolved and added.

## Rulesets

Rulesets are named exports of `fitness.config.ts` that overlay the base config. They answer "when": after each edit,
or at the PR. Overlays change rules only, so the structure is the same in every ruleset. They name slots by typed
path and roles by name, both checked against the base config's types:

```ts
export const edit = f.ruleset(config, {
  rules: { 'cognitive-complexity': { max: 12 } },
  slots: { 'ui.components': { rules: { 'module-cohesion': false } } },
  roles: { test: { rules: { 'function-cohesion': false } } },
});
```

A slot path names every unit of that slot at any depth, since recursive components share one slot. `--print-config`
prints the slot tree with each slot's resolved rules.

## Queries

The model answers "where does this file sit, and what may it import?" before code is written. The CLI comes first,
with `--json`; the same functions can back an MCP tool later.

```sh
fitness model                         # the unit tree, with every unit found
fitness where src/ui/project/graph/graph.test.ts  # a file's unit, role and surfaces, and what it may reach
fitness may src/ui/project/graph/graph.ts src/domain/project.ts
```

`fitness where src/ui/project/graph/graph.test.ts --json`, with [working title's config](#working-title). A role's
meaning is split between where it is matched and where it is granted reach, so `where` shows the merged result and
where each grant comes from:

```json
{
  "file": "src/ui/project/graph/graph.test.ts",
  "unit": { "id": "src/ui/project/graph", "slot": "ui.components.subcomponent", "archetype": "component", "captures": { "name": "graph" } },
  "chain": [".", "src/ui", "src/ui/project", "src/ui/project/graph"],
  "role": "test",
  "surfaces": [],
  "reach": [
    { "from": "own unit", "units": ["src/ui/project/graph"] },
    { "from": "children", "surfaces": ["src/ui/project/graph/card: render, testing"] },
    { "from": "slot ui.components", "surfaces": ["ui.strings", "ui.icons"] },
    { "from": "slot ui", "surfaces": ["application"] },
    { "from": "role test, granted by working-title", "surfaces": ["ui.testing", "testRunner"] }
  ],
  "externals": ["vite-plus/*", "@playwright/*"],
  "rules": ["logic-not-on-the-dom"],
  "reachableFrom": []
}
```

`may` returns the verdict and what decided it: the grant that allowed the edge, or whether the target was private
or simply not granted, and any inline rule that refused it. Slot `description`s are what an agent reads to choose a slot
for new code.

## Extending the model

The model has to stay open to an act layer: codemods that add a unit, move a file or introduce a port, reading the
same archetypes to decide what to write and gating on `diff`. What keeps it possible:
archetypes are plain data with names, `ModelView.verdict` answers for an edge that doesn't exist yet, and the model
is built separately from rules. New fact sources add edges without touching rules, and a slots-only shorthand for
`f.archetype` can come later.

## Performance

- **Unit resolution is cached.** Finding units walks the file system for markers. The result is cached and rebuilt
  only when a file is added, removed or renamed.
- **Whole-graph rules can run less often.** Only fan-in and cycles need the whole project. Edge checks need only
  the changed files and the surfaces of what they import; a change on the target side finds its importers through
  the reverse index. A rule's phase is its default, and a project can change it per rule in
  config or in a ruleset ([open question 3](#open-questions)).
- **Analysis is incremental.** The hook holds a TS 7.1 snapshot between calls and applies `snapshot.update()` for
  changed files instead of rebuilding the program.
- **There is a budget.** An edit-phase check on working title stays under 500 ms, so a regression is
  visible.

## Prior art

| | [Sheriff] | [eslint-plugin-boundaries] | [dependency-cruiser] | [Nx enforce-module-boundaries] | fitness (this design) |
| --- | --- | --- | --- | --- | --- |
| Units | path tree with `<placeholder>` tags | flat list, glob and capture | a regex per rule | projects, tagged in project config | tree of archetypes, recursive |
| Nesting | through the path tree | parent, child and sibling relationships | no | no: a project is the smallest unit | `contains`, recursive |
| Surface | barrel `index.ts`, or an `internal/` folder | entry-point rule | no | the project's entry point, imported by its scope | named surfaces per archetype |
| File categories | no | yes | regex | no | roles, inherited |
| Type and value edges | no | yes | yes | no | yes, as a `types` option |
| Re-export chains | no | no | no | no | resolved to the declarer |
| Required imports | no | no | yes | no | `requires` |
| Cycles | no | no | files | projects | files and units |
| External packages | no | yes | yes | per tag | per slot |
| Unit measures | no | no | no | no | yes |
| Queries | no | no | no | project graph (`nx graph`) | yes |

Borrowed: from boundaries, file categories (roles) apart from units, and parent, child and sibling relationships;
from Sheriff, the placeholder syntax and its barrel and internal-folder surfaces, which here are just globs
(`['index.ts']`, `['**', '!internal/**']`). `index.ts` is one possible marker or surface among others.

[Sheriff]: https://github.com/softarc-consulting/sheriff
[eslint-plugin-boundaries]: https://github.com/javierbrea/eslint-plugin-boundaries
[dependency-cruiser]: https://github.com/sverweij/dependency-cruiser
[Nx enforce-module-boundaries]: https://github.com/nrwl/nx/tree/master/packages/eslint-plugin

## Validation

Configs written against each repo as of 2026-11-21 (working title at `cb16dd5`). A preset is an archetype like any other, so a project either
uses one as a slot's `use` or writes the shape out, as all three configs below do.

### Working title

This replaces every rule in `.dependency-cruiser.mjs`, `no-circular` included. Components are strictly nested: each
sits inside the one that renders it (`project` holds `graph`, which holds `card`, and `panel`; `your-projects` holds
`project-list`, which holds `start-a-project`, and `projects-folder`). `icons` and `strings` sit beside them in
`ui`. Its tsconfig includes `**/*.ts`, so the config models `e2e/`, `lint/` and the root's own files too, and the
root CSS files (`reset.css`, `shell.css`, `tokens.css`) are in `src/`.

```ts
import { defineConfig, f } from 'fitness';

const test = f.role({ files: '**/*.test.ts', externals: ['vite-plus/*', '@playwright/*'] });
const dsl = f.role({ files: '**/*.dsl.ts', extends: test });
const harness = f.role({ files: '**/*.harness.ts', extends: test });
const testPage = f.role({ files: '**/*.test-page.ts', extends: test });
const driver = f.role({ files: '**/*.driver.ts', extends: test });
const driverContract = f.role({ files: 'src/test-helpers/driver.ts', extends: test });
const journey = f.role({ files: ['e2e/**/*.spec.ts', 'e2e/writer.ts', 'e2e/private-build.ts'], extends: test });
const dom = f.role({ files: '**/*.dom.ts' });

const component = f.archetype('component', (s, self) => ({
  identify: { marker: '{name}.dom.ts' },
  surface: {
    render: ['{name}.dom.ts'],
    testing: ['{name}.dsl.ts', '{name}.harness.ts', '{name}.test-page.ts'],
  },
  roles: { dom, test },
  rules: { 'logic-not-on-the-dom': f.deny({ from: { roleNot: [dom, test] }, to: dom }) },
  slots: {
    subcomponent: f.slot({ dir: '{name}', use: self, description: 'A component used only inside this one' }),
  },
}));

const ui = f.archetype('ui', (s) => ({
  surface: {
    render: [s.components.render],     // the top-level components, for the shell
    testing: [s.components.testing],
    words: [s.strings],
  },
  rules: { 'dependency-direction': { types: 'ignore' } },   // types from a component's private modules are fine
  slots: {
    components: f.slot({ dir: '{name}', use: component, dependsOn: [s.strings, s.icons] }),
    strings: f.slot({ dir: 'strings', description: "The app's words" }),
    icons: f.slot({ dir: 'icons' }),
  },
}));

const workingTitle = f.archetype('working-title', (s) => ({
  loose: 'deny',
  roles: {
    test: test.with({ dependsOn: [s.ui.testing, s.testRunner] }),
    dsl, harness, testPage, driver, driverContract, journey,
    dom,
  },
  rules: {
    'no-cycle': { types: 'count' },   // as depcruise, which counts type imports
    'dsl-not-on-a-driver': f.deny({ from: dsl, to: driver }),
    'dsl-on-the-driver-contract': f.requires({ from: dsl, to: driverContract }),
  },
  slots: {
    domain: f.slot({ dir: 'src/domain', externals: [] }),
    ports: f.slot({ dir: 'src/ports', dependsOn: [s.domain], externals: [] }),
    application: f.slot({ dir: 'src/application', dependsOn: [s.domain, s.ports], externals: [] }),
    adapters: f.slot({ dir: 'src/adapters', dependsOn: [s.domain, s.ports], externals: ['*'] }),
    ui: f.slot({ dir: 'src/ui', use: ui, dependsOn: [s.application], externals: [] }),
    methods: f.slot({ dir: 'src/methods', dependsOn: [s.domain], externals: [], description: 'Method definitions as data' }),
    shell: f.slot({
      files: ['src/main.ts', 'src/app.ts', 'src/shell.ts', 'src/*.css'],
      dependsOn: [s.application, s.adapters, s.ports, s.methods, s.ui.render, s.ui.words],
      externals: ['virtual:*'],
    }),
    testRunner: f.slot({
      dir: 'src/test-helpers',
      dependsOn: [s.domain, s.application, s.adapters, s.methods, s.shell, s.ui.render, s.ui.testing],
      externals: ['*'],
    }),
    e2e: f.slot({ dir: 'e2e', dependsOn: [s.adapters, s.ui.testing, s.testRunner], externals: ['*'], description: 'Journeys against the built app' }),
    lint: f.slot({ dir: 'lint', externals: ['*'] }),
    tooling: f.slot({ files: ['*.ts', 'scripts/**/*.ts'], dependsOn: [s.lint], externals: ['*'] }),
  },
}));

export default defineConfig({ root: workingTitle });
```

How some edges come out:

| Edge | Verdict | Why |
| --- | --- | --- |
| `project/project.dom.ts` → `project/graph/graph.dom.ts` | ✅ | a parent reaches the surfaces of the units it contains |
| `project/project.dom.ts` → `project/graph/card/card.dom.ts` | ❌ | `card` is inside `graph`, and `graph` doesn't pass it on in `render` |
| `project/graph/graph.dom.ts` → `project/panel/panel.dom.ts` | ❌ | siblings: nothing grants `graph` reach to `panel` |
| `project/graph/card/card.dom.ts` → `icons/open-beside.dom.ts` | ✅ | `components` depends on `icons`, and `card` is below it |
| `project/graph/card/card.ts` → `icons/open-beside.dom.ts` | ❌ | `logic-not-on-the-dom` |
| `project/graph/card/card.ts` → `project/graph/card/card.dom.ts` | ❌ | same unit, but `logic-not-on-the-dom` forbids it |
| `project/graph/graph.test.ts` → `project/graph/card/card.harness.ts` | ✅ | a parent reaches its child's `testing` surface |
| `src/app.ts` → `project/project.dom.ts` | ✅ | the shell depends on `ui.render`, which holds the top-level components |
| `src/app.ts` → `project/graph/card/card.dom.ts` | ❌ | `card` isn't in `ui.render` |
| `domain/project.ts` → `test-helpers/staging.ts` | ❌ | domain depends on nothing, and isn't `test` |

What fits:

- Layer direction, a component reached only through its render file, logic-not-on-the-dom, the language and driver
  rules, the required driver-contract import, and cycles all map directly. `ui/icons` has no `icons.dom.ts`, so the
  marker leaves it out of `components`.
- The nesting is the reach: a component reaches only its direct children, and `icons` and `strings` are the shared
  utilities every component may use. Utilities stay one-directional, since they depend on nothing. No sibling
  component imports exist in the code, and the config refuses them.
- Only tests reach test code and the runner, because only `test` is granted them. That's stricter than depcruise,
  which forbade only drivers, languages and harnesses.
- The shell lists exactly what it wires together, and reaches only the top-level components.
- The ui reaching a port through application's re-export is a `dependency-direction` finding on each ui importer,
  since edges resolve to the declarer, and a `no-cross-unit-reexport` finding on application.

What doesn't fit well, and what it says about the structure:

- `src/test-helpers/` reaches into `card` (`graph-page.ts` and its neighbours import `card.ts` and
  `card.test-page.ts`), which the config refuses: `card` is private to `graph`. That is the structure smell the
  planned move fixes. Once each component's harness, test page and driver live in its folder, those files join the
  component's `testing` surface and are reached through its parent, and only the generic runner stays in
  `testRunner`.
- `types: 'ignore'` on `ui` lets every type-only import from ui files through, including types from domain, which
  depcruise counted. Keeping types from a component's private modules allowed without that needs a surface for
  types, which the config doesn't have.
- `e2e/` is all test code, but its files have to be listed by role. A slot-level default role would be simpler.
- The slots for `e2e/`, `lint/` and the root's files are guesses from the folder docs.

### Weaver

Weaver has its own layers: ports at the bottom, an engine tier, operations, a daemon that dispatches, and plugins as
slices. No surfaces are declared, so every unit exposes everything and only `dependsOn` limits reach.

```ts
const test = f.role({ files: '**/*.test.ts', externals: ['vitest'] });

const plugin = f.archetype('plugin', () => ({ description: 'One framework: detection, engine, helpers' }));
const plugins = f.archetype('plugins', (s) => ({ slots: { plugin: f.slot({ dir: '{name}', use: plugin }) } }));

const weaver = f.archetype('weaver', (s) => ({
  loose: 'deny',
  roles: { test: test.with({ dependsOn: [s.testHelpers] }) },
  slots: {
    ports: f.slot({ dir: 'src/ports', externals: ['node:*'] }),
    domain: f.slot({ dir: 'src/domain', dependsOn: [s.ports], externals: ['node:path'] }),
    utils: f.slot({ dir: 'src/utils', dependsOn: [s.domain, s.ports], externals: ['*'] }),
    tsEngine: f.slot({ dir: 'src/ts-engine', dependsOn: [s.domain, s.ports, s.utils, s.operations], externals: ['*'] }),
    operations: f.slot({ dir: 'src/operations', dependsOn: [s.domain, s.ports, s.utils, s.tsEngine], externals: ['node:path'] }),
    plugins: f.slot({ dir: 'src/plugins', use: plugins, dependsOn: [s.domain, s.ports, s.utils, s.tsEngine, s.operations], externals: ['*'] }),
    daemon: f.slot({ dir: 'src/daemon', dependsOn: [s.domain, s.ports, s.utils, s.tsEngine, s.operations, s.plugins, s.adapters], externals: ['*'] }),
    adapters: f.slot({ dir: 'src/adapters', dependsOn: [s.daemon, s.ports, s.utils], externals: ['*'] }),
    testHelpers: f.slot({ dir: 'src/__testHelpers__', dependsOn: [s.domain, s.ports, s.utils, s.tsEngine, s.operations, s.plugins], externals: ['*'] }),
  },
}));

export default defineConfig({ root: weaver, tsconfig: 'tsconfig.fitness.json' });   // see below
```

What fits: the tiers, and plugins as slices: no plugin's `dependsOn` names another, so a Svelte plugin couldn't
import the Vue one. `externals: ['node:path']` on domain and operations replaces `domain-purity.test.ts` and
`operations-purity.test.ts`.

What doesn't, mostly design smells the model brings out rather than gaps in it:

- `operations/types.ts` is a contract the engines and plugins import, and `adapters/schema.ts` is one the daemon
  imports. So `tsEngine` and `operations` depend on each other, as do `daemon` and `adapters`, and `unit-cycle`
  reports both. A named surface (`operations.contract`) would narrow what `tsEngine` reaches, but the loop stays
  until those files move to their own slot.
- `ports/` holds `NodeFileSystem` and `InMemoryFileSystem` beside the `FileSystem` interface, and `filesystem.ts`
  re-exports the Node one. Saying "ports hold contracts" would need contract and implementation slots inside
  `ports`, and the re-export would become a `no-cross-unit-reexport` finding.
- `operations` imports `safe-regex2`, which its `externals` reports. That needs a decision, not a config change.
- Weaver's `tsconfig.json` leaves tests out and `tsconfig.test.json` holds only tests, so modelling both needs a
  tsconfig that includes both. Either fitness accepts a list of tsconfigs or the project adds one.

### Fitness

```ts
const test = f.role({ files: '**/*.test.ts', externals: ['node:*'] });

const rule = f.archetype('rule', () => ({ surface: ['*.ts', '!*.test.ts'] }));

const rules = f.archetype('rules', (s) => ({
  slots: {
    shared: f.slot({ files: 'shared.ts' }),
    index: f.slot({ files: 'index.ts', dependsOn: [s.rule] }),
    rule: f.slot({ dir: '{id}', use: rule, dependsOn: [s.shared] }),
  },
}));

const model = f.archetype('model', (s) => ({
  slots: {
    core: f.slot({ files: '*.ts' }),
    rules: f.slot({ dir: 'rules', use: rules, dependsOn: [s.core] }),
  },
}));

const fitness = f.archetype('fitness', (s) => ({
  loose: 'deny',
  roles: { test },
  slots: {
    model: f.slot({ dir: 'src/model', use: model, externals: ['node:path'] }),
    app: f.slot({ dir: 'src/app', dependsOn: [s.model], externals: ['node:*'] }),
    reporters: f.slot({ dir: 'src/reporters', dependsOn: [s.model] }),
    adapters: f.slot({ dir: ['src/analysis', 'src/config', 'src/git'], dependsOn: [s.app, s.model], externals: ['*'] }),
    entry: f.slot({ files: ['src/cli.ts', 'src/builtins.ts'], dependsOn: [s.adapters, s.reporters, s.app, s.model] }),
    api: f.slot({ files: 'src/index.ts', dependsOn: [s.model], rules: { 'no-cross-unit-reexport': { allow: [s.model] } } }),
    integrations: f.slot({ dir: 'integrations' }),
    tests: f.slot({
      files: 'test/*.ts',
      dependsOn: [s.model, s.app, s.reporters, s.adapters, s.entry, s.api, s.integrations],
      externals: ['node:*'],
      description: 'Tests against the public units',
    }),
  },
}));

export default defineConfig({ root: fitness });
```

What fits, and says more than today's kinds: the model's core can't import the rules nested inside it, rules can't
import each other (only `shared.ts`), and the three adapter folders are separate units that may not import each
other. That's true today but not enforced. Tests sit in their own slot, since they live apart from the code.

What doesn't fit well:

- Tests in `test/` reach internals such as `rules/shared.ts` because no surfaces are declared. A separate test tree
  gets less from the model than colocated tests.
- "Every rule folder has a README.md" is a rule about the file system, not imports. Out of scope for now.

## Migration

- `kinds` is replaced. Each kind becomes a slot under the root with `files: <its globs>`, the same
  `dependsOn`, and its `rules`. That's mechanical: `fitness migrate-config` prints it, and the project nests slots
  by hand afterwards.
- `exclude` is removed; the tsconfig decides which files are read. Today's configs exclude tests, so the first run
  after migrating will classify test files, which need roles or slots. Projects whose tsconfig leaves tests out
  need a tsconfig that holds them.
- Overlaps between kinds, which order resolved silently, now resolve by specificity or fail as equal-specificity
  errors. A flat migration keeps globs as they are, so expect a few on the first run.
- Today "a kind may import itself" covers every file in the kind. Inside one unit that still holds. Two units of one
  slot now need `dependsOn: [<own slot>]` to meet. A flat migration makes one unit per kind, so nothing changes until
  a slot uses a placeholder.
- Keys of existing rules keep their form (`rule:file->file`), so the first diff after migrating is quiet apart from
  the renamed rule (`no-cross-kind-reexport` to `no-cross-unit-reexport`). The diff cache key already includes the
  tool's digest, so old findings aren't reused.
- Plugins use `unit` and `model.unitOf` in place of `RuleContext.kind` and `kindOf`. The only plugin today, the test
  fixture modelled on working title, becomes an inline rule.
- Ruleset overlays move from `kinds: { x: { rules } }` to `slots: { 'x': { rules } }`; `migrate-config` rewrites them.

## Delivery

1. Model: archetype types, finding units on the file system, `unclassified`, specificity and its errors,
   `fitness model`, `migrate-config`. Existing rules run on `unit` through a shim.
2. Rule contract: scopes, `ModelView`, phase and `--phase`. Port the built-in rules.
3. Structure: named surfaces, reach, roles and `.with()` grants, inline rules (`f.deny`, `f.requires`),
   `no-cross-unit-reexport`, `unit-cycle`, `no-cycle`. Working title's config lands here, reporting beside depcruise.
4. Queries: `where` and `may`. Try them from omp on working title before going further, so a real consumer shapes
   what follows.
5. Facts: external edges and assets, then `unit-externals`.
6. Facts: exports, then export use (#6) and export surface (#5).
7. Facts: calls, then #4a and #4b. Naming anonymous callbacks by their call lands with this.

## Open questions

1. **How does a child reach its parent's own files?** Today, by giving them a `files` slot. The alternative is a
   parent handle in `dependsOn`.
2. **Phase or rulesets for "when"?** A rule's `phase` says when its findings start to mean something; rulesets
   carry "when" for a project. Keep both, with `phase` as the default, or drop `phase` and ship an `edit` ruleset.
3. **Should per-function rules roll up?** `cognitive-complexity` and `function-cohesion` stay; open is whether they
   also feed unit measures (worst or total per unit).
4. **Severity?** Every finding is equal today. Whether rules or slots set a severity, and whether `--fail` honours
   it, is undecided.
5. **Lint adapter?** Findings could appear in oxlint or Biome as well as through the hook and SARIF.
6. **Architectures not laid out in folders or names,** such as a boundary that exists only in a DI container or a
   package's `exports` map. A known limit: finding units needs a path, a marker or a predicate over paths.
7. **Type-only reach.** `types: 'ignore'` is the only way to let types cross a surface, and it lets all of a file's
   type imports through. Is that enough, or does a surface need a way to expose types only?
8. **Default role for a slot.** A folder that is all test code (`e2e/`) has its files listed in a role. Should a
   slot be able to give every file in it a role?

## Noted concerns

- **A role's meaning is split.** It is matched where an archetype lists it and granted reach where a parent calls
  `.with()`. `where` has to show the merged result, or reading a role means reading the whole config.
- **`.with()` is one more concept** to learn beside `dependsOn` and surfaces.
- **TypeScript inference is the biggest technical risk:** typing `s` from the callback's own return, nested surface
  handles such as `s.ui.render` (which need `ui`'s surface type), and lazy self-references through `self`. If
  inference won't do it, the fallback is naming slots before the callback.
- **Callbacks mean the config is data only after it runs.** `--print-config` shows the result, but the source can't
  be read statically, and `match` functions and plugin rules stay executable.

## Next step

A spike before more design: the builders with real types, unit resolution, and edge verdicts on working title,
checked against the table above. It tests the riskiest part (inference) and the core semantics together.
