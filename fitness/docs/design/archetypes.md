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
| **Slot** | A named place inside a parent archetype, filled by an archetype. Other slots refer to it by handle in `dependsOn`. | `ui`, `domain`, `components` inside `ui` |
| **Unit** | An instance of a slot in the code: a folder or a group of files. Its id is its path. | `src/ui/graph` |
| **Role** | A file's purpose within its unit, given by its name. Roles are declared on an archetype, apply to every unit below it, and can extend each other. A file has one role. | `test`, `dom`, `dsl` extends `test` |
| **Edge** | One import between two files, as analysis resolved it. The rule contract calls a file a module. | `graph.ts` → `card.dom.ts` |
| **Rule** | A check over files, units or the whole graph, against the model. It reports findings. | `dependency-direction` |
| **Query** | A question asked of the model rather than of the code's findings. | `fitness where <file>` |

How they relate:

```
config                         code
──────                         ────
archetype ──used by──► slot ──resolves to──► unit ──contains──► files (each with a role)
                        │                                          │
                        └── dependsOn, externals, surface      roles: importableBy
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

const component = f.archetype('component', (s, self) => ({
  identify: { marker: '{name}.dom.ts' },
  surface: ['{name}.dom.ts'],
  rules: { 'module-cohesion': { maxLines: 150 } },
  slots: {
    subcomponent: f.slot({ dir: '{name}', use: self }),
  },
}));

const app = f.archetype('app', (s) => ({
  roles: {
    test: f.role({ files: '**/*.test.ts', importableBy: [s.test], rules: { 'function-cohesion': false } }),
    dom: f.role({ files: '**/*.dom.ts', importableBy: [s.dom, s.test] }),
  },
  slots: {
    domain: f.slot({ dir: 'src/domain', externals: [] }),
    application: f.slot({ dir: 'src/application', dependsOn: [s.domain], externals: [] }),
    components: f.slot({ dir: 'src/ui/{name}', use: component, dependsOn: [s.application, s.components] }),
  },
}));

export default defineConfig({ root: app, rules: { 'cognitive-complexity': { max: 15 } } });
```

Read it as: the project holds a domain, an application and some components. A component is a folder under
`src/ui/` that holds `<folder>.dom.ts`. Components may import the application and each other, but another component
only through its `.dom.ts`, and a component may hold more components. Only test files may import a test file, and
only `dom` and test files may import a `dom` file.

**Archetypes.** `f.archetype(name, (s, self) => spec)`. Settings sit at the top of the spec, and every key under
`slots` is a slot, so a slot's name can never collide with a setting.

**Handles, not strings.** `s` holds a handle for each of the archetype's slots and roles, by name, and `self` is the
archetype being defined, for recursion. A handle is a placeholder resolved after the spec is built, so `s.domian` is
a type error rather than a silent miss. Slot and role names share `s`, so they must differ.

**Slots.** `f.slot({ dir, files, use, dependsOn, externals, rules })`. The key is only a name: where the slot's
units are is always written out with `dir` or `files`, never taken from the key.

**Roles.** `f.role({ files, extends, dependsOn, externals, importableBy, rules })`. A role can extend another and
inherits everything the parent allows: `dsl: f.role({ files: '**/*.dsl.ts', extends: s.test })` is a test file, so
anything that may import a test file may import it.

**Rules.** One `rules` key in four places: global (`defineConfig`), archetype, slot and role. A built-in rule is
configured by id. A rule defined inline is given by value under a local name, and a local name that shadows a
built-in id is refused:

```ts
rules: {
  'module-cohesion': { maxLines: 300 },                            // built-in, by id
  'dsl-not-on-a-driver': f.deny({ from: s.dsl, to: s.driver }),    // inline, by value
  'dsl-on-the-contract': f.requires({ from: s.dsl, to: s.driverContract }),
}
```

**Plain data.** The builders return data, and handles become slot paths once resolved. `--print-config` prints the
resolved model, with every default filled in and nothing executable left except `match` functions and plugin
rules. Finding keys and the diff cache hash that data.

### Types

```ts
interface ArchetypeSpec {
  identify?: { marker: string } | { match: (dir: string, chain: UnitView[]) => false | Record<string, string> };
  surface?: string[];            // globs outsiders may import; default ['**'], [] is sealed
  roles?: Record<string, Role>;
  slots?: Record<string, Slot>;
  externals?: string[];
  loose?: 'allow' | 'deny';      // own files outside any slot; default 'allow', the root defaults to 'deny'
  rules?: RuleSettings;
  description?: string;          // for agents choosing where code goes
}

interface SlotSpec {
  dir?: string | string[];       // relative to the parent unit; may hold {captures}: 'ui/{name}'
  files?: string | string[];     // a group of files, one unit: ['main.ts', 'app.ts'], '*.ts'
  use?: Archetype;               // default: an archetype with nothing inside
  dependsOn?: Handle[] | '*';    // sibling slots its units may import; default []
  externals?: string[];          // packages it may import: [] none, ['*'] any, globs; unset adds no limit
  cycles?: 'allow';              // tolerate a known cycle among its siblings
  rules?: RuleSettings;
  description?: string;
}

interface RoleSpec {
  files: string | string[];
  extends?: Handle;              // a role in the same archetype
  dependsOn?: Handle[];          // slots its files may also import
  externals?: string[];          // packages its files may also import
  importableBy?: Handle[];       // roles or slots whose files may import its files; unset means anyone
  rules?: RuleSettings;
}

type RuleSettings = Record<string, boolean | object | InlineRule>;   // InlineRule from f.deny or f.requires

interface FitnessConfig {
  root: Archetype;
  tsconfig?: string;             // default 'tsconfig.json'; its program is what fitness reads
  generated?: string[];          // globs: in the model, never reported on
  plugins?: Record<string, Plugin>;
  rules?: RuleSettings;
}
```

A surface is a list of globs, like `externals`: `['**']` exposes everything (the default), `['**', '!internal/**']`
hides an `internal/` folder, `['index.ts']` is a barrel, and `[]` seals the unit.

`kinds` and `exclude` go. A `dir` without a placeholder is one unit; with one, it is a unit per match, and a list of
dirs is a unit per entry. `files` is always one unit. A slot's `dir` or `files` says where to look, and its
archetype's `identify`, if it has one, says which of those folders count: `dir: '{name}'` with
`marker: '{name}.dom.ts'` takes only folders that hold their own `.dom.ts`.

A slots-only shorthand, where `f.archetype` takes a plain object, can be added later.

## Finding units

1. The root unit is the config's folder.
2. For each unit, each slot finds its instances among the unit's own files and folders. A marker matches the
   shallowest folder. Deeper matches are found when fitness looks inside that unit, if its archetype has a slot
   that finds them.
3. A file belongs to its deepest unit.
4. A file has exactly one role, the most specific one that matches it.
5. A file left among the own files of a unit with `loose: 'deny'` is `unclassified`, as today.

**Most specific wins, and order never matters.** Reordering a config never changes the result.

- Slots under one parent: a literal segment beats a placeholder, which beats `**`. `ui/strings` beats `ui/{name}`,
  so `strings` isn't taken as a component.
- Roles in one archetype: the longer literal suffix wins. `*.component.test.ts` beats `*.test.ts`, which beats
  `*.ts`.
- `extends` is an explicit signal: where a role and one it extends both match, the extending role wins.
  `driver: f.role({ files: '**/*.driver.ts', extends: s.testHelper })` wins inside `src/test-helpers/`.
- Equal specificity is a config error that names both candidates and suggests narrowing a glob or adding `extends`.
  `*.dsl.ts` against `card.*` is one.
- Across levels, structure decides: a role in a nearer archetype beats one further out, as an inner name shadows an
  outer one.

Finding units reads the file system, not only the TS program: a marker can be a file the program doesn't hold,
such as `component.json`.

**Captures.** `{name}` matches one path segment. An archetype's templates (`marker`, `surface`) see only the unit's
own captures, never an ancestor's, so nested components with their own `{name}` don't collide. A `match` function
gets the whole chain for anything else. Unit ids are full paths, so a query never needs captures to tell units
apart.

**What counts as a file.** The tsconfig's program: TS, JS with `allowJs`, and Vue, Svelte, Astro or MDX through
TypeScript 7.1's `contentMappers`, which a project opts into because they run external code. A plain asset that
code imports (CSS, JSON, SVG) joins the unit whose folder holds it. It can be the target of an edge, and surfaces
apply to it, but nothing is analysed inside it. Facts come from fact sources (today, the TS analysis), so another
source, such as CSS's own `@import`s, can add edges later without touching rules.

**Generated files.** Files matching `generated` stay in the model with their edges. Rules still judge edges into
them, such as direction and externals for their importers, but findings located in a generated file are dropped.

## Edges

Analysis already resolves each import to the module that declares the names, through barrels and re-exports, and
records `via`, whether it is type-only, and whether it is a re-export. Two additions:

- **External edges:** an import of a package or a `node:` module is kept as an edge with `external: '<package>'`
  (today it is dropped).
- **Assets:** an import of a CSS, JSON or SVG file is an edge to that file.

### How an edge is judged

An edge from file A to file B passes only if both sides allow it: A's side must permit B, and B's side, where it
says anything, must permit A.

**A's side: direction and surfaces.** Take each file's chain of units from the root, and their deepest shared unit
L. Let `a` and `b` be the children of L that hold A and B, or none when the file is one of L's own files.

| Case | Allowed when |
| --- | --- |
| Same unit (`a` and `b` are both none) | always |
| Parent to child (`a` is none) | B is on the surface of every unit from `b` down to B's unit |
| Child to parent's own files (`b` is none) | never. Give those files a `files` slot and depend on it. |
| Siblings in different slots | `a`'s slot lists `b`'s slot in `dependsOn`, or A's role does, and the surface chain holds |
| Siblings in the same slot | the slot lists itself in `dependsOn`, and the surface chain holds |

**B's side: `importableBy`.** If B's role sets `importableBy`, A must have one of the listed roles (directly or by
extending it) or sit in one of the listed slots. `importableBy` exists on roles only.

**Inline rules.** Every `f.deny` and `f.requires` that applies to A must pass.

A permission one side grants and the other always refuses is dead. Where the config alone shows that, such as a
role's `dependsOn` naming a slot whose files all have a role that refuses it, fitness warns.

**Structure passes at every level.** `dependsOn`, `externals`, surfaces and `importableBy` must hold at every level
of the tree that sets them, so no level can allow what another forbids. That's what keeps a preset's guarantees
when it's nested inside another archetype.

**Thresholds resolve nearest first.** For a rule's options: the file's role, then its slot, then each archetype from
the innermost out, then the global `rules`, then the rule's defaults. Options resolve for the file a finding is
reported on. Structure is a set of invariants; thresholds are tuning, which a project may want to differ between
tests and code, or between ui components and utilities.

**Edge kinds.** Edges keep whether they are type-only and whether they re-export, but the config doesn't match on
them in general. The rules where type imports change the answer take `types: 'count' | 'ignore'`:
`dependency-direction`, `unit-surface`, `unit-externals` and both cycle rules. Re-exports have their own rule.

**Externals.** An external edge must be allowed at every level of A's chain that sets `externals`. At each level,
the packages A's role adds count as part of that level's list, just as a role's `dependsOn` adds to its slot's.
Entries are package names or globs: `node:*`, `@aws-sdk/*`. Unset means that level adds no limit, so a list applies
to the slot's whole subtree, and a child can only narrow it. The canonical case is a hexagon where only `adapters`
may import packages. This is a property of the slot, not general package linting.

**Cycles.** `unit-cycle` builds, for each unit, the graph of edges between its children, and reports each loop, so
two layers that import each other are a cycle even when no pair of files is. `no-cycle` does the same over files.
Each reports one finding per edge in a loop, keyed `unit-cycle:src/ui->src/application` or `no-cycle:a.ts->b.ts`.
Keying on the whole loop would make a loop that grows look resolved and then new. Type-only edges are ignored by
default because they don't load at run time. A slot with `cycles: 'allow'` tolerates a known loop among its
siblings, and `where` shows it as tolerated.

### Rules that judge the model

Each failure is one finding per file pair per rule, as today.

| Check | Rule id |
| --- | --- |
| direction and `importableBy` (details say which side refused) | `dependency-direction` |
| the surface chain | `unit-surface` (new) |
| an inline rule | its local name |
| re-exporting another unit's names | `no-cross-unit-reexport` (renamed; `allow` takes slot handles) |
| a package the unit may not import | `unit-externals` (new) |
| a loop between units | `unit-cycle` (new) |
| a loop between files | `no-cycle` (new) |
| a file in no unit | `unclassified` (from the model, as today) |

## Tests

Test code is code, and the model treats it that way: test files belong to units, have roles, and obey `dependsOn`,
surfaces, externals and `importableBy` like everything else. There is no built-in test rule and no `isTest` flag.

- A test file belongs to the unit it sits in, which is normally the unit it tests. That's how it reaches the unit's
  internals: they are in the same unit, so no surface applies.
- "Test" is a role a file has within its unit. The role's `dependsOn` and `externals` add the test helpers and the
  test runner for its files, so app code can't reach them: a plain direction rule.
- `importableBy: [s.test]` on the test role keeps test code out of app code, and roles that extend it (languages,
  harnesses, test pages, drivers) inherit that.
- Code that tests across units is reached through surfaces like any other code. A component's surface lists its
  render file and its test-facing files, and `importableBy` keeps app code off the test-facing ones.
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
  isGenerated(file: string): boolean;
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
  onSurface(file: string): boolean;
}
```

- A project rule runs once and looks up options per file with `optionsFor`. `undefined` means the rule is off for
  that file. Export use counts the importers of every export, then asks `optionsFor` for the file that declares it.
- `RuleContext.kind` and `kindOf` go; plugins use `unit` and `model.unitOf` instead. The only plugin today is the
  test fixture modelled on working title, which becomes an inline rule.

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
- A key never holds a slot or archetype name (renaming a slot must not churn findings), a line number, a position
  among declarations, or an option value.
- An anonymous function is named by the function around it and the call it's passed to, `src/a.ts#load>then(0)`,
  not by its position. A `#n` suffix is added only when two such names are identical. This settles the open issue
  about fragile keys for callbacks.
- Unit findings key on the unit id (`module-count:src/ui/graph`), and project findings on their subject
  (`export-use:src/x.ts#foo`).
- Before comparing, `diff` maps base keys through git's renames (`git diff -M --name-status`), so a moved file's
  findings carry over instead of showing as resolved and added.

## Rulesets

Rulesets are named exports of `fitness.config.ts` that overlay the base config. They answer "when" (after each edit,
at the PR), never "where": overlays change rules only, never structure. They name slots by typed path and roles by
name, both checked against the base config's types:

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
fitness where src/ui/graph/layout.ts  # a file's unit, role and surface, and what it may import
fitness may src/ui/graph/graph.ts src/domain/project.ts
```

`fitness where src/ui/graph/layout.ts --json`, with [working title's config](#working-title):

```json
{
  "file": "src/ui/graph/layout.ts",
  "unit": { "id": "src/ui/graph", "slot": "ui.components", "archetype": "component", "captures": { "name": "graph" } },
  "chain": [".", "src/ui", "src/ui/graph"],
  "role": null,
  "onSurface": false,
  "mayImport": [
    { "slot": "ui.components", "units": ["src/ui/card", "src/ui/panel", "src/ui/project", "src/ui/your-projects"], "surface": ["{name}.dom.ts", "{name}.dsl.ts", "{name}.harness.ts", "{name}.test-page.ts"], "types": "ignore" },
    { "slot": "ui.strings", "units": ["src/ui/strings"], "surface": ["**"] },
    { "slot": "ui.icons", "units": ["src/ui/icons"], "surface": ["**"] },
    { "slot": "application", "units": ["src/application"], "surface": ["**"] }
  ],
  "externals": [],
  "mayNotImport": [
    { "slot": "domain", "because": "ui dependsOn application only" },
    { "slot": "testHelpers", "because": "only the test role depends on it" },
    { "role": "dom", "because": "dom is importableBy dom, test and shell" },
    { "role": "test", "because": "test is importableBy test, and its extensions inherit that" }
  ],
  "importableBy": [{ "unit": "src/ui/graph" }]
}
```

`may` returns the verdict and every check behind it (`dependency-direction` on each side, `unit-surface`, each inline rule), and which side refused, so
an agent can see why. Slot `description`s are what an agent reads to choose a slot for new code; the model doesn't
guess what code means.

## Extending the model

The model has to stay open to an act layer: codemods that add a unit, move a file or introduce a port, reading the
same archetypes to decide what to write and gating on `diff`. Nothing here builds that. What keeps it possible:
archetypes are plain data with names, `ModelView.verdict` answers for an edge that doesn't exist yet, and the model
is built separately from rules. The same goes for new fact sources: they add edges, and rules don't change.

## Prior art

| | Sheriff | eslint-plugin-boundaries | dependency-cruiser | archetypes |
| --- | --- | --- | --- | --- |
| Units | path tree with `<placeholder>` tags | flat list, glob and capture | a regex per rule | tree of archetypes, recursive |
| Nesting | through the path tree | parent, child and sibling relationships | no | `contains`, recursive |
| Surface | barrel `index.ts`, or an `internal/` folder | entry-point rule | no | globs per archetype |
| File categories | no | yes | regex | roles, inherited |
| Type and value edges | no | yes | yes | yes, as a `types` option |
| Re-export chains | no | no | no | resolved to the declarer |
| Required imports | no | no | yes | `requires` |
| Cycles | no | no | files | files and units |
| External packages | no | yes | yes | per slot |
| Unit measures | no | no | no | yes |
| Queries | no | no | no | yes |

Borrowed: from boundaries, file categories (roles) apart from units, and parent, child and sibling relationships;
from Sheriff, the placeholder syntax and its barrel and internal-folder surfaces, which here are just globs
(`['index.ts']`, `['**', '!internal/**']`) rather than a convention.
No convention is required: `index.ts` is one possible marker or surface, never assumed.

## Validation

Configs written against each repo as of 2026-11-21. A preset is an archetype like any other, so a project either
uses one as a slot's `use` or writes the shape out, as all three configs below do.

### Working title

This replaces every rule in `.dependency-cruiser.mjs`, `no-circular` included. Its tsconfig includes `**/*.ts`, so
the config models `e2e/`, `lint/` and the root's own files too. The root is flat, so every slot and role shares one
set of handles.

```ts
import { defineConfig, f } from 'fitness';

const component = f.archetype('component', (s, self) => ({
  identify: { marker: '{name}.dom.ts' },
  // Another component reaches it through render<Component> and its test-facing files.
  surface: ['{name}.dom.ts', '{name}.dsl.ts', '{name}.harness.ts', '{name}.test-page.ts'],
  slots: {
    subcomponent: f.slot({ dir: '{name}', use: self, description: 'A component used only inside this one' }),
  },
}));

const ui = f.archetype('ui', (s) => ({
  rules: { 'unit-surface': { types: 'ignore' } },   // types from a component's plain modules are fine
  slots: {
    components: f.slot({ dir: '{name}', use: component, dependsOn: [s.components, s.strings, s.icons, s.transition] }),
    strings: f.slot({ dir: 'strings', description: "The app's words" }),
    icons: f.slot({ dir: 'icons' }),
    transition: f.slot({ files: 'transition.ts' }),
  },
}));

const workingTitle = f.archetype('working-title', (s) => ({
  loose: 'deny',
  roles: {
    test: f.role({
      files: '**/*.test.ts',
      dependsOn: [s.testHelpers],
      externals: ['vite-plus/*', '@playwright/*'],
      importableBy: [s.test],
    }),
    dsl: f.role({ files: '**/*.dsl.ts', extends: s.test }),
    harness: f.role({ files: '**/*.harness.ts', extends: s.test }),
    testPage: f.role({ files: '**/*.test-page.ts', extends: s.test }),
    journey: f.role({ files: ['e2e/**/*.spec.ts', 'e2e/writer.ts', 'e2e/private-build.ts'], extends: s.test }),
    testHelper: f.role({ files: 'src/test-helpers/**', extends: s.test }),
    driver: f.role({ files: '**/*.driver.ts', extends: s.testHelper }),
    driverContract: f.role({ files: 'src/test-helpers/driver.ts', extends: s.testHelper }),
    dom: f.role({ files: '**/*.dom.ts', importableBy: [s.dom, s.test, s.shell] }),
  },
  rules: {
    'no-cycle': { types: 'count' },   // as depcruise, which counts type imports
    'dsl-not-on-a-driver': f.deny({ from: s.dsl, to: s.driver }),
    'dsl-on-the-driver-contract': f.requires({ from: s.dsl, to: s.driverContract }),
  },
  slots: {
    domain: f.slot({ dir: 'src/domain', externals: [] }),
    ports: f.slot({ dir: 'src/ports', dependsOn: [s.domain], externals: [] }),
    application: f.slot({ dir: 'src/application', dependsOn: [s.domain, s.ports], externals: [] }),
    adapters: f.slot({ dir: 'src/adapters', dependsOn: [s.domain, s.ports], externals: ['*'] }),
    ui: f.slot({ dir: 'src/ui', use: ui, dependsOn: [s.application], externals: [] }),
    methods: f.slot({ dir: 'src/methods', dependsOn: [s.domain], externals: [], description: 'Method definitions as data' }),
    shell: f.slot({ files: ['src/main.ts', 'src/app.ts', 'src/shell.ts', 'src/*.css'], dependsOn: '*', externals: ['virtual:*'] }),
    testHelpers: f.slot({ dir: 'src/test-helpers', dependsOn: '*', externals: ['*'] }),
    e2e: f.slot({ dir: 'e2e', dependsOn: [s.ui, s.testHelpers], externals: ['*'], description: 'Journeys against the built app' }),
    lint: f.slot({ dir: 'lint', externals: ['*'] }),
    tooling: f.slot({ files: ['*.ts', 'scripts/**/*.ts'], dependsOn: [s.lint], externals: ['*'] }),
  },
}));

export default defineConfig({ root: workingTitle });
```

What fits:

- Layer direction, a component reached only through its render file (a surface), the language and driver rules,
  the required driver-contract import, and cycles all map directly. `ui/icons` has no `icons.dom.ts`, so the
  marker rightly leaves it out of `components`.
- "Logic not on the DOM" is `importableBy` on the `dom` role, not a rule: only `dom` files, tests and the shell may
  import a `.dom.ts`.
- "Only tests reach test code" is `importableBy: [s.test]`, inherited by every test role, and "app code may not
  import test helpers" is direction: only the `test` role depends on `testHelpers`. That's stricter than depcruise,
  which forbade only drivers, languages and harnesses.
- Nested components (`your-projects` holding `project-list`, `projects-folder` and `start-a-project`) come from
  `self`. `graph` importing `project-list.dom.ts` fails the surface chain at `your-projects`, which depcruise's
  one-level regex misses.
- The ui reaching a port through application's re-export is a `dependency-direction` finding on each ui importer,
  since edges resolve to the declarer, and a `no-cross-unit-reexport` finding on application.

`src/test-helpers/` is due to move into component folders. When it does, each component's harness, test page and
driver become files with those roles inside the component, and the config doesn't change: the roles match by name
wherever the files are. Only the generic runner stays in `testHelpers`, and `driver` then extends `test` rather than
`testHelper`.

What doesn't fit well:

- One role per file forces the extends chain to follow the folder layout: `driver` extends `testHelper` only because
  drivers currently live in `src/test-helpers/`, where both globs match.
- `e2e/` is all test code, but its files have to be listed by role. A slot-level default role would be simpler.
- Cross-component test reach was exempt in depcruise. Here a component's test-facing files are on its surface, which
  is more explicit but needs checking against the code. The slots for `e2e/`, `lint/` and the root's files are
  guesses from the folder docs.

### Weaver

Weaver's layers aren't a textbook hexagon's: ports at the bottom, an engine tier, operations, a daemon that
dispatches, and plugins as slices.

```ts
const plugin = f.archetype('plugin', () => ({ description: 'One framework: detection, engine, helpers' }));
const plugins = f.archetype('plugins', () => ({ slots: { plugin: f.slot({ dir: '{name}', use: plugin }) } }));

const weaver = f.archetype('weaver', (s) => ({
  loose: 'deny',
  roles: {
    test: f.role({ files: '**/*.test.ts', dependsOn: [s.testHelpers], externals: ['vitest'], importableBy: [s.test] }),
  },
  slots: {
    ports: f.slot({ dir: 'src/ports', externals: ['node:*'] }),
    domain: f.slot({ dir: 'src/domain', dependsOn: [s.ports], externals: ['node:path'] }),
    utils: f.slot({ dir: 'src/utils', dependsOn: [s.domain, s.ports], externals: ['*'] }),
    tsEngine: f.slot({ dir: 'src/ts-engine', dependsOn: [s.domain, s.ports, s.utils, s.operations], externals: ['*'] }),
    operations: f.slot({ dir: 'src/operations', dependsOn: [s.domain, s.ports, s.utils, s.tsEngine], externals: ['node:path'] }),
    plugins: f.slot({ dir: 'src/plugins', use: plugins, dependsOn: [s.domain, s.ports, s.utils, s.tsEngine, s.operations], externals: ['*'] }),
    daemon: f.slot({ dir: 'src/daemon', dependsOn: [s.domain, s.ports, s.utils, s.tsEngine, s.operations, s.plugins, s.adapters], externals: ['*'] }),
    adapters: f.slot({ dir: 'src/adapters', dependsOn: [s.daemon, s.ports, s.utils], externals: ['*'] }),
    testHelpers: f.slot({ dir: 'src/__testHelpers__', dependsOn: '*', externals: ['*'] }),
  },
}));

export default defineConfig({ root: weaver, tsconfig: 'tsconfig.fitness.json' });   // see below
```

What fits: the tiers, and plugins as slices, isolated from each other by default so a Svelte plugin couldn't import
the Vue one. `externals: ['node:path']` on domain and operations replaces `domain-purity.test.ts` and
`operations-purity.test.ts`.

What doesn't, mostly design smells the model brings out rather than gaps in it:

- `operations/types.ts` is a contract the engines and plugins import, and `adapters/schema.ts` is one the daemon
  imports. So `tsEngine` and `operations` depend on each other, as do `daemon` and `adapters`, and `unit-cycle`
  reports both. Moving those files to their own slot removes the loops.
- `ports/` holds `NodeFileSystem` and `InMemoryFileSystem` beside the `FileSystem` interface, and `filesystem.ts`
  re-exports the Node one. Saying "ports hold contracts" would need contract and implementation slots inside
  `ports`, and the re-export would become a `no-cross-unit-reexport` finding.
- `operations` imports `safe-regex2`, which its `externals` reports. That needs a decision, not a config change.
- Weaver's `tsconfig.json` leaves tests out and `tsconfig.test.json` holds only tests, so modelling both needs a
  tsconfig that includes both. Either fitness accepts a list of tsconfigs or the project adds one.

### Fitness

```ts
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
  roles: { test: f.role({ files: '**/*.test.ts', externals: ['node:*'], importableBy: [s.test] }) },
  slots: {
    model: f.slot({ dir: 'src/model', use: model, externals: ['node:path'] }),
    app: f.slot({ dir: 'src/app', dependsOn: [s.model], externals: ['node:*'] }),
    reporters: f.slot({ dir: 'src/reporters', dependsOn: [s.model] }),
    adapters: f.slot({ dir: ['src/analysis', 'src/config', 'src/git'], dependsOn: [s.app, s.model], externals: ['*'] }),
    entry: f.slot({ files: ['src/cli.ts', 'src/builtins.ts'], dependsOn: [s.adapters, s.reporters, s.app, s.model] }),
    api: f.slot({ files: 'src/index.ts', dependsOn: [s.model], rules: { 'no-cross-unit-reexport': { allow: [s.model] } } }),
    integrations: f.slot({ dir: 'integrations' }),
    tests: f.slot({ files: 'test/*.ts', dependsOn: '*', externals: ['node:*'], description: 'Tests against the public units' }),
  },
}));

export default defineConfig({ root: fitness });
```

What fits, and says more than today's kinds: the model's core can't import the rules nested inside it, rules can't
import each other (only `shared.ts`), and the three adapter folders are separate units that may not import each
other. That's true today but not enforced. Tests sit in their own slot, since they live apart from the code.

What doesn't fit well:

- Tests in `test/` reach internals such as `rules/shared.ts` through surfaces that are mostly `['**']`. A separate test
  tree gets less from the model than colocated tests.
- "Every rule folder has a README.md" is a rule about the file system, not imports. Out of scope for now.

## Migration

- `kinds` is removed, not deprecated. Each kind becomes a slot under the root with `files: <its globs>`, the same
  `dependsOn`, and its `rules`. That's mechanical: `fitness migrate-config` prints it, and the project nests slots
  by hand afterwards.
- `exclude` is removed; the tsconfig decides which files are read. Today's configs exclude tests, so the first run
  after migrating will classify test files, which need roles or slots. Projects whose tsconfig leaves tests out
  need a tsconfig that holds them. `exclude` can come back if a real need shows up.
- Overlaps between kinds, which order resolved silently, now resolve by specificity or fail as equal-specificity
  errors. A flat migration keeps globs as they are, so expect a few on the first run.
- Today "a kind may import itself" covers every file in the kind. Inside one unit that still holds. Two units of one
  slot now need `dependsOn: [<own slot>]` to meet. A flat migration makes one unit per kind, so nothing changes until
  a slot uses a placeholder.
- Keys of existing rules keep their form (`rule:file->file`), so the first diff after migrating is quiet apart from
  the renamed rule (`no-cross-kind-reexport` to `no-cross-unit-reexport`). The diff cache key already includes the
  tool's digest, so old findings aren't reused.
- Ruleset overlays move from `kinds: { x: { rules } }` to `slots: { 'x': { rules } }`; `migrate-config` rewrites them.

## Delivery

1. Model: archetype types, finding units on the file system, `unclassified`, specificity and its errors,
   `generated`, `fitness model`, `migrate-config`. Existing rules run on `unit` through a shim.
2. Rule contract: scopes, `ModelView`, phase and `--phase`. Port the built-in rules.
3. Structure: surfaces, roles, `importableBy`, inline rules (`f.deny`, `f.requires`), `unit-surface`,
   `no-cross-unit-reexport`, `unit-cycle`, `no-cycle`. Working title's config lands here, reporting beside depcruise rather than replacing it.
4. Queries: `where` and `may`. Try them from omp on working title before going further, so a real consumer shapes
   what follows.
5. Facts: external edges and assets, then `unit-externals`.
6. Facts: exports, then export use (#6) and export surface (#5).
7. Facts: calls, then #4a and #4b. Naming anonymous callbacks by their call lands with this.

## Open questions

1. **A child never imports its parent's own files.** The workaround is a `files` slot (fitness's `model.core`). The
   alternative is a parent entry in `dependsOn`. Proposed: none until a case needs it.
2. **Units of one slot are isolated by default.** They need the slot in its own `dependsOn` to import each other.
   Weaver's plugins and fitness's rules want isolation; working title's components opt in.
3. **Phase or rulesets for "when".** Rulesets carry "when" (edit or PR). A rule's `phase` says when its findings
   start to mean something, so `export-use` doesn't fire halfway through a change. Open: keep both, with `phase` as
   the rule's default and rulesets as the project's override, or drop `phase` and ship an `edit` ruleset.
4. **Per-function rules.** `cognitive-complexity` and `function-cohesion` stay. Open: whether they also roll up into
   unit measures (worst or total per unit), so they speak to modularity as well as quality.
5. **Severity.** Every finding is equal today. Whether rules or slots set a severity, and whether `--fail` honours
   it, is undecided.
6. **Lint adapter.** Findings could appear in oxlint or Biome as well as through the hook and SARIF. Undecided
   whether that's worth an adapter.
7. **Architectures not laid out in folders or names,** such as a module boundary that exists only in a DI container
   or a package's `exports` map. A known limit: finding units needs a path, a marker or a predicate over paths.

## Noted concerns

- **A slot in its own `dependsOn`** (`components: f.slot({ dependsOn: [s.components] })`) means its units may import
  each other. That's subtle to read, and may want an explicit option instead.
- **`dependsOn: '*'` on the shell** is how working title says "the composition root wires everything". A named
  composition-root concept might say it better and let rules treat it specially.
- **Callbacks mean the config is data only after it runs.** `--print-config` shows the result, but the source can't
  be read statically, and `match` functions and plugin rules stay executable.
- **Typing `s` from the callback's own return** is the hard part of the TypeScript. If inference won't do it, the
  fallback is naming slots and roles before the callback.
- **Handles reach only the archetype's own slots and roles.** A nested archetype can't name a role declared further
  out, which is partly why working title's config is flat at the root.
- **One role per file** makes `extends` chains follow the folder layout where a folder glob overlaps a suffix glob
  (working title's `driver` extends `testHelper` for now).
