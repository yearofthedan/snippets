# Design: archetypes

Status: proposal. No code changes yet.

## Summary

Warp (renamed from fitness) classifies files today with `kinds`: a flat list of globs, the first match wins. This
design replaces them with **archetypes**: unit types that nest, so a config describes the codebase as a tree of
modules rather than a list of folders. It also widens the rule contract so rules can see whole units and the whole
graph, not one file at a time.

The result is one model of the codebase's modules. Lint checks code against it, and agents query it before writing
code.

## Vision and scope

Warp is a declared model of a codebase's modules, used to keep it modular. It has four parts, with the model at
the core:

- **The model:** the units, the parts inside them, what each part uses, and what each unit exposes.
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
- Architectures that aren't laid out in folders or file names ([decided](#decided)).

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
| **Archetype** | A reusable unit type. It says how its instances are found, which parts they contain, what they expose to their parent, and what they require from above or provide below. | `component`, `layer` |
| **Part** | A named piece of an archetype: a group of the unit's own files (`w.files`) or child folders of another archetype (`w.dir`). Every file belongs to one part. A part's `using` lists what its files may import. | `dom`, `test`, `components` |
| **Unit** | An instance of an archetype in the code: the root, or a folder an `w.dir` part matched. Its id is its path. | `src/ui/project/graph` |
| **Surface** | What a unit exposes to its parent: named groups of its parts. A file on no surface is private to its unit. | `render`, `testPage` |
| **Edge** | One import between two files, as analysis resolved it. The rule contract calls a file a module. | `graph.ts` → `card.dom.ts` |
| **Rule** | A check over files, units or the whole graph, against the model. It reports findings. | `dependency-direction` |
| **Query** | A question asked of the model rather than of the code's findings. | `warp where <file>` |

How they relate:

```
config                                   code
──────                                   ────
archetype ──contains──► parts ──match──► units and files
    │                     │                     │
    ├── exposes            └── using             ▼
    ├── provides / requires              edges between files
    │                                           │
rules judge edges and units against the parts ──► findings
queries read the same model ──► answers for agents
```

An archetype is a type, and an `w.dir` part is a use of it, the way a class is used by a field. The same `component`
archetype fills the `components` part of `ui` and, through `self`, the `subcomponent` part of each component. A
part's options (`using`, `externals`, `rules`) belong to that place in the tree, so one archetype can be used in two
places with different neighbours.

## Config

A config is built with typed builders, in the style of zod, and the builders return plain data. Archetype keys are
verbs: what it `contains`, what it `exposes` to its parent, what it `requires` from above, and what it `provides` to
anything below.

```ts
import { defineConfig, w } from 'warp';

const testRunner = w.archetype('test-runner', (s) => ({
  exposes: { contract: s.contract, runner: s.rest },
  contains: {
    contract: w.files(['driver.ts', 'steps.ts']),
    rest: w.files('**'),
  },
}));

const component = w.archetype('component', (s, { self, required }) => ({
  identify: { marker: '{name}.dom.ts' },
  requires: { testRunner, strings: w.dir(), icons: w.dir() },
  exposes: { render: s.dom, testPage: s.testPage },
  contains: {
    logic: w.files('*.ts', { using: [required.strings] }),
    dom: w.files('{name}.dom.ts', { using: [s.logic, s.subcomponent.render, required.icons, required.strings] }),
    testPage: w.files('*.test-page.ts', { using: [s.dom, s.subcomponent.testPage] }),
    test: w.files('*.test.ts', { using: [s.logic, s.dom, s.testPage, required.testRunner.runner] }),
    subcomponent: w.dir('{name}', self),
  },
}));

const ui = w.archetype('ui', (s) => ({
  provides: { strings: s.strings, icons: s.icons },
  exposes: { render: s.components.render, testPage: s.components.testPage },
  contains: {
    components: w.dir('{name}', component),
    strings: w.dir('strings'),
    icons: w.dir('icons'),
  },
}));

const app = w.archetype('app', (s) => ({
  provides: { testRunner: s.testRunner },
  contains: {
    domain: w.dir('src/domain', { externals: [] }),
    application: w.dir('src/application', { using: [s.domain], externals: [] }),
    ui: w.dir('src/ui', ui, { using: [s.application] }),
    main: w.files('src/main.ts', { using: [s.application, s.ui.render] }),
    testRunner: w.dir('src/test-helpers', testRunner, { using: [s.domain, s.application, s.ui.testPage] }),
  },
}));

export default defineConfig({ root: app, rules: { 'cognitive-complexity': { max: 15 } } });
```

Read it as: the project holds a domain, an application, a ui, an entry point and a test runner. A component is a
folder under `src/ui/` that holds `<folder>.dom.ts`. Its `dom` file is its `render` surface, its test pages are its
`testPage` surface, and the rest is private. Logic may not import the dom; the dom builds itself from its logic and
its subcomponents' render files. Components need strings and icons, which `ui` provides, and the test runner, which
the root provides. Everything under `ui` may import the application.

**Parts.** `w.files(pattern, options?)` is a group of the unit's own files. `w.dir(path, archetype?, options?)` is a
child unit per matching folder; without an archetype, the folder is a plain unit whose files are all exposed. The key
is the part's name. A catch-all part is called `rest`, by convention: `rest: w.files('**')`.

**References.** The callback is `(s, { self, required })`. `s.x` is a part of this archetype: for a files part, its
files; for a dir part, everything its units expose, and `s.x.render` for one named surface. `required.x` is a
requirement, and `required.testRunner.contract` one of its surfaces. A reference is a placeholder resolved after the
spec is built, so a misspelt `s.domian` is a type error, and `self` is the archetype being defined, for recursion.

**`using` is the only permission.** A file may import the other files of its own part, and whatever its part lists
in `using`. Parts of one unit reach each other only through `using`. A parent reaches a child only through what the
child exposes. A child never reaches its parent: an archetype is used in many places, so it can't name one. What a
child needs from above, it requires.

`using` on an `w.dir` part applies to every file below it, so `ui: w.dir('src/ui', ui, { using: [s.application] })`
lets every component import the application. Each dir part's `using` adds to what the files below it may use.

**Surfaces.** `exposes` names what a unit offers its parent, as references to its own parts or to its children's
surfaces: `render: s.components.render` passes the components' render files on. A file in no exposed part is private.
An archetype with no `exposes` exposes everything.

**Requires and provides.** `requires` is an archetype's external interface, typed by archetype: `requires: {
testRunner, strings: w.dir() }`, where `w.dir()` and `w.files()` stand for a part with no archetype. `provides` offers
a part to anything below that requires it by that name. The nearest provider wins, and archetypes in between say
nothing, so `ui` passes nothing down for the test runner the root provides. Config errors, before any file is read:

- a requirement with no provider above some unit that has it;
- a requirement that no part lists in `using`;
- a provider whose part doesn't match the required archetype.

A provision that nothing below requires is a warning.

**Loose files.** `loose: 'allow' | 'warn' | 'deny'` says what happens to a unit's own files that no part matches.
`warn` reports them without counting them in `--fail`, and `deny` makes each an `unclassified` finding. The default
is `allow`, and the root defaults to `deny`.

**Rules.** One `rules` key in four places: global (`defineConfig`), archetype, dir part and files part. A built-in
rule is configured by id. A rule defined inline is given by value under a local name, and a local name that shadows a
built-in id is refused:

```ts
rules: {
  'module-cohesion': { maxLines: 300 },                                          // built-in, by id
  'dsl-on-the-contract': w.requires({ from: s.dsl, to: required.testRunner.contract }),   // inline, by value
}
```

**Plain data.** The builders return data, and references become part paths once resolved. `--print-config` prints the
resolved model with every default filled in; `match` functions and plugin rules are the only code left in it.
Finding keys and the diff cache hash that data.

### Types

```ts
interface ArchetypeSpec {
  identify?: { marker: string } | { match: (dir: string, chain: UnitView[]) => false | Record<string, string> };
  requires?: Record<string, Archetype | Shape>;   // Shape: w.dir() or w.files(), a part with no archetype
  provides?: Record<string, Ref>;                 // offered to anything below that requires the name
  exposes?: Record<string, Ref | Ref[]>;          // unset: everything is exposed
  contains?: Record<string, Part>;
  externals?: string[];
  loose?: 'allow' | 'warn' | 'deny';              // default 'allow'; the root defaults to 'deny'
  rules?: RuleSettings;
  description?: string;                           // for agents choosing where code goes
}

type Ref = Reference;   // s.part, s.part.surface, required.name, required.name.surface

// w.files(pattern: string | string[], options?: FilesOptions)
interface FilesOptions {
  using?: Ref[];                 // what its files may import, beyond their own part
  externals?: string[];          // packages it may import: [] none, ['*'] any, globs
  rules?: RuleSettings;
  description?: string;
}

// w.dir(path: string | string[], archetype?: Archetype, options?: DirOptions)
interface DirOptions extends FilesOptions {
  cycles?: 'allow';              // tolerate a known cycle among its units
}

// 'off' is shorthand for { '*': false }: every rule off at that level, any listed beside '*' back on
type RuleSettings = 'off' | Record<string, boolean | object | InlineRule>;   // InlineRule from w.deny or w.requires

interface WarpConfig {
  root: Archetype;
  tsconfig?: string;             // default 'tsconfig.json'; its program is what Warp reads
  plugins?: Record<string, Plugin>;
  rules?: RuleSettings;
}
```

An `w.dir` path is relative to the parent unit. Without a placeholder it is one unit; with one (`'{name}'`), a unit
per match; a list of paths is a unit per entry. The archetype's `identify`, if it has one, says which matching
folders count: `w.dir('{name}', component)` with `marker: '{name}.dom.ts'` takes only folders that hold their own
`.dom.ts`.

## Finding units

1. The root unit is the config's folder.
2. For each unit, each `w.dir` part finds its units among the unit's own folders. A marker matches the shallowest
   folder. Deeper matches are found when Warp looks inside that unit, if its archetype has a part that finds them.
3. A file belongs to its deepest unit, and within it to exactly one files part: the most specific that matches.
4. A file no part matches is loose, and the unit's `loose` setting decides what that means.

**Most specific wins.** Line order in the config never matters.

- Dir parts: a literal segment beats a placeholder, which beats `**`. `strings` beats `{name}`, so `strings` isn't
  taken as a component.
- Files parts: the longer literal suffix wins. `*.test-page.ts` beats `*.ts`, and `{name}.dom.ts` beats `*.ts`.
  `rest` (`**`) loses to everything.
- Equal specificity is a config error that names both candidates and suggests narrowing a pattern. `*.dsl.ts`
  against `card.*` is one.

Finding units reads the file system, so a marker can be a file outside the TS program, such as `component.json`.

**Captures.** `{name}` matches one path segment. An archetype's templates (`marker`, file patterns) see only the
unit's own captures, so nested components each have their own `{name}`. A `match` function gets the whole chain for
anything else. Unit ids are full paths, so queries identify units without captures.

**What counts as a file.** The tsconfig's program: TS, JS with `allowJs`, and Vue, Svelte, Astro or MDX through
TypeScript 7.1's `contentMappers`, which a project opts into because they run external code. A plain asset that
code imports (CSS, JSON, SVG) belongs to a part like any other file. It can be the target of an edge, and surfaces
apply to it, but nothing is analysed inside it. Facts come from fact sources (today, the TS analysis), so another
source, such as CSS's own `@import`s, can add edges later without touching rules.

**Generated files.** Generated code is a part with its rules off: `generated: w.dir('src/generated', { rules: 'off'
})`, or `rules: { '*': false, 'unit-cycle': true }` to keep a few. It stays a normal node: its importers are judged by
their own `using` and externals, and it counts in fan-in, cycles and queries. Only findings located in it are
silenced.

## Edges

Analysis already resolves each import to the module that declares the names, through barrels and re-exports, and
records `via`, whether it is type-only, and whether it is a re-export. Two additions:

- **External edges:** an import of a package or a `node:` module is kept as an edge with `external: '<package>'`.
- **Assets:** an import of a CSS, JSON or SVG file is an edge to that file.

### How an edge is judged

Privacy belongs to the target, reach to the consumer. An edge from file A to file B passes when B is within A's
reach and every inline rule that applies to A passes. A's reach is:

- **its own part:** the other files in it;
- **its part's `using`:** the parts and surfaces listed, with each `required.x` resolved to what the nearest
  provider above offers;
- **the `using` of every dir part on A's chain,** which applies to everything below it.

A reference reaches only what it names. `s.ui.render` holds the files `ui` puts in `render`, and through
`s.components.render` the components' render files, but nothing private to any of them. Two units of one dir part
meet only if the part lists itself: `w.dir('src/{name}', nestModule, { using: [s.modules.api] })`.

Type imports are imports: they obey `using` and surfaces like any other. A unit exposes types through a public file,
a types file in an exposed part, or a barrel (`exposes: { api: s.index }`).

**Externals** narrow down the tree: an external edge must be allowed at every level of A's chain that sets a list.
A part's own list counts at every level for its own files, so a `test` part that lists its runner can import it
inside a layer that allows nothing else. Entries are package names or globs (`node:*`, `@aws-sdk/*`). Unset means
that level adds no limit. The canonical case is a hexagon where only `adapters` may import packages.

**Inline rules.** `w.requires({ from, to })` reports a file in `from` that has no edge to `to`, and `w.deny({ from,
to })` forbids an edge that `using` would allow. Both take references.

**Thresholds resolve nearest first.** For a rule's options: the file's files part, then its dir part, then each
archetype from the innermost out, then the global `rules`, then the rule's defaults. Options resolve for the file a
finding is reported on, so a project can set different thresholds for tests and code, or for ui components and
utilities.

**Edge kinds.** Edges record whether they are type-only and whether they re-export. The cycle rules take
`types: 'count' | 'ignore'`, since a type-only edge doesn't load at run time. Re-exports have their own rule.

**Cycles.** `unit-cycle` builds, for each unit, the graph of edges between its child units, and reports each loop,
so two layers that import each other are a cycle even when no pair of files is. `no-cycle` does the same over files.
Each reports one finding per edge in a loop, keyed `unit-cycle:src/ui->src/application` or `no-cycle:a.ts->b.ts`,
so a loop that grows only adds findings. Type-only edges are ignored by default. A dir part with `cycles: 'allow'`
tolerates a known loop among its units, and `where` shows it as tolerated.

### Rules that judge the model

Each failure is one finding per file pair per rule.

| Check | Rule id |
| --- | --- |
| B outside A's reach (details say whether B is private or just not in `using`) | `dependency-direction` |
| an inline rule | its local name |
| re-exporting another unit's names | `no-cross-unit-reexport` (`allow` takes references) |
| a package the part may not import | `unit-externals` |
| a loop between units | `unit-cycle` |
| a loop between files | `no-cycle` |
| a loose file where `loose` is `deny` (or `warn`, reported only) | `unclassified` |

## Tests

Test code is code, and the model treats it that way: test files belong to parts, and obey `using` and externals
like everything else.

- A test file sits in the unit it tests, in a `test` part whose `using` names what it tests, including private
  parts. That's how it reaches the unit's internals.
- A component's test-facing files are parts it exposes (`testPage`, `dsl`), beside `render`. A parent's tests reach
  them through its children's surfaces.
- The test runner is required by the archetypes whose tests need it and provided by the root. App code can't reach
  it, because no app part lists it.
- A test tree kept apart from the code (Warp's own `test/`) is its own part, and its tests go through the
  surfaces of what they test.
- Tests cut across the tree, so every archetype that holds them declares a `test` part. Overlays, which would add a
  part to every archetype at once, are a possible later answer.

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

interface ModuleContext<O> { module: ModuleFacts; unit: UnitView; part: string; options: O; model: ModelView }
interface UnitContext<O>   { unit: UnitView; modules: ModuleFacts[]; options: O; model: ModelView }
interface ProjectContext<O> { project: Project; model: ModelView; optionsFor(file: string): O | undefined }

interface ModelView {
  units(): UnitView[];
  unitOf(file: string): UnitView | undefined;
  partOf(file: string): string | undefined;   // the files part, by name
  verdict(edge: ImportEdge): Verdict;     // the structure decision, so custom rules can reuse it
  importersOf(file: string): ImportEdge[];  // reverse index, built once
  exportsOf(file: string): ExportFacts[];
}

interface UnitView {
  id: string;                 // its path: 'src/ui/project/graph'
  part: string;               // part path: 'ui.components'
  archetype: string;
  captures: Record<string, string>;
  parent?: UnitView;
  children: UnitView[];
  ownFiles: string[];
  parts: Record<string, string[]>;      // own files per files part
  surfaces: Record<string, string[]>;   // resolved files per exposed surface
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
`warp diff --phase edit` skips commit-phase rules, and the omp hook passes it. `check` and plain `diff` run
every rule. A config can change a rule's phase with the reserved option `phase`, and so can a ruleset. Phase is
what the rule knows about itself; rulesets stay the project's tuning.

## Finding keys

Diff matches findings by key, so a key must survive edits that don't change the finding.

- The form is `rule:subject[->object]`. A subject or object is a path, `path#symbol`, `path#Class.method`, or a unit
  id.
- Keys hold only paths, symbols and unit ids. Part and archetype names, line numbers, declaration positions and
  option values stay out, so renaming a part or moving code within a file leaves keys alone.
- An anonymous function is named by the function around it and the call it's passed to, `src/a.ts#load>then(0)`,
  with a `#n` suffix only when two such names are identical.
- Unit findings key on the unit id (`module-count:src/ui/project/graph`), and project findings on their subject
  (`export-use:src/x.ts#foo`).
- Before comparing, `diff` maps base keys through git's renames (`git diff -M --name-status`), so a moved file's
  findings carry over instead of showing as resolved and added.

## Rulesets

Rulesets are named exports of `warp.config.ts` that overlay the base config. They answer "when": after each edit,
or at the PR. Overlays change rules only, so the structure is the same in every ruleset. They name parts by typed
path, checked against the base config's types:

```ts
export const edit = w.ruleset(config, {
  rules: { 'cognitive-complexity': { max: 12 } },
  parts: {
    'ui.components': { rules: { 'module-cohesion': false } },
    'ui.components.test': { rules: { 'function-cohesion': false } },
  },
});
```

A part path names that part in every unit at any depth, since recursive components share one part. `--print-config`
prints the part tree with each part's resolved rules.

## Queries

The model answers "where does this file sit, and what may it import?" before code is written. The CLI comes first,
with `--json`; the same functions can back an MCP tool later.

```sh
warp model                                         # the unit tree, with every unit found
warp where src/ui/project/graph/graph.test.ts      # a file's unit, part and surfaces, and what it may reach
warp may src/ui/project/graph/graph.ts src/domain/project.ts
```

`warp where src/ui/project/graph/graph.test.ts --json`, with [working title's config](#working-title). Reach
comes from the file's part, the dir parts above it and its requirements, so `where` shows each source:

```json
{
  "file": "src/ui/project/graph/graph.test.ts",
  "unit": { "id": "src/ui/project/graph", "part": "ui.components.subcomponent", "archetype": "component", "captures": { "name": "graph" } },
  "part": "test",
  "chain": [".", "src/ui", "src/ui/project", "src/ui/project/graph"],
  "surfaces": [],
  "reach": [
    { "from": "own part test", "files": ["graph.test.ts", "graph.component.test.ts", "graph.dsl.test.ts", "layout.test.ts"] },
    { "from": "test using", "parts": ["logic", "dom", "harness", "testPage", "dsl"], "surfaces": ["card: testPage"] },
    { "from": "required testRunner, provided by working-title", "surfaces": ["src/test-helpers: runner"] },
    { "from": "dir part ui using", "surfaces": ["application"] }
  ],
  "externals": ["vite-plus/*"],
  "rules": ["dsl-on-the-driver-contract"],
  "reachableFrom": []
}
```

`may` returns the verdict and what decided it: the reference that allowed the edge, or whether the target was
private or simply not in `using`, and any inline rule that refused it. Part `description`s are what an agent reads to
choose where new code goes.

## Extending the model

The model has to stay open to an act layer: codemods that add a unit, move a file or introduce a port, reading the
same archetypes to decide what to write and gating on `diff`. What keeps it possible:
archetypes are plain data with names, `ModelView.verdict` answers for an edge that doesn't exist yet, and the model
is built separately from rules. New fact sources add edges without touching rules, and a parts-only shorthand for
`w.archetype` can come later.

## Performance

- **Unit resolution is cached.** Finding units walks the file system for markers. The result is cached and rebuilt
  only when a file is added, removed or renamed.
- **Whole-graph rules can run less often.** Only fan-in and cycles need the whole project. Edge checks need only
  the changed files and the surfaces of what they import; a change on the target side finds its importers through
  the reverse index. A rule's phase is its default, and a project can change it per rule in
  config or in a ruleset ([decision 2](#decided)).
- **Analysis is incremental.** The hook holds a TS 7.1 snapshot between calls and applies `snapshot.update()` for
  changed files instead of rebuilding the program.
- **There is a budget.** An edit-phase check on working title stays under 500 ms, so a regression is
  visible.

## Prior art

| | [Sheriff] | [eslint-plugin-boundaries] | [dependency-cruiser] | [Nx enforce-module-boundaries] | Warp (this design) |
| --- | --- | --- | --- | --- | --- |
| Units | path tree with `<placeholder>` tags | flat list, glob and capture | a regex per rule | projects, tagged in project config | tree of archetypes, recursive |
| Nesting | through the path tree | parent, child and sibling relationships | no | no: a project is the smallest unit | `contains`, recursive |
| Surface | barrel `index.ts`, or an `internal/` folder | entry-point rule | no | the project's entry point, imported by its scope | named surfaces in `exposes` |
| File categories | no | yes | regex | no | files parts, each with its own `using` |
| Type and value edges | no | yes | yes | no | recorded; cycle rules can ignore type-only edges |
| Re-export chains | no | no | no | no | resolved to the declarer |
| Required imports | no | no | yes | no | `w.requires` |
| Cycles | no | no | files | projects | files and units |
| External packages | no | yes | yes | per tag | per part |
| Unit measures | no | no | no | no | yes |
| Queries | no | no | no | project graph (`nx graph`) | yes |

Borrowed: from boundaries, file categories apart from units, and parent, child and sibling relationships; from
Sheriff, the placeholder syntax and its barrel and internal-folder surfaces, which here are just files parts
(`w.files('index.ts')`); from Vue's provide and inject, the nearest provider answering a requirement. `index.ts` is
one possible marker or surface among others.

[Sheriff]: https://github.com/softarc-consulting/sheriff
[eslint-plugin-boundaries]: https://github.com/javierbrea/eslint-plugin-boundaries
[dependency-cruiser]: https://github.com/sverweij/dependency-cruiser
[Nx enforce-module-boundaries]: https://github.com/nrwl/nx/tree/master/packages/eslint-plugin

## Validation

Configs written against each repo as of 2026-11-21 (working title at `cb16dd5`). A preset is an archetype like any
other, so a project either uses one in an `w.dir` part or writes the shape out, as the configs below do. The last
two, a NestJS app and a shared component library, are on paper; the spike checks them against sample projects.

### Working title

This replaces every rule in `.dependency-cruiser.mjs`, `no-circular` included. Components are strictly nested: each
sits inside the one that renders it (`project` holds `graph`, which holds `card`, and `panel`; `your-projects` holds
`project-list`, which holds `start-a-project`, and `projects-folder`). `icons`, `strings` and `transition.ts` sit
beside them in `ui`. Its tsconfig includes `**/*.ts`, so the config models `e2e/`, `lint/` and the root's own files
too, and the root CSS files (`reset.css`, `shell.css`, `tokens.css`) are in `src/`.

```ts
import { defineConfig, w } from 'warp';

const testRunner = w.archetype('test-runner', (s) => ({
  exposes: { contract: s.contract, runner: s.rest },
  contains: {
    contract: w.files(['driver.ts', 'steps.ts']),
    rest: w.files('**'),
  },
}));

// a folder of code whose tests need the runner: domain, application, adapters, lint
const layer = w.archetype('layer', (s, { required }) => ({
  requires: { testRunner },
  exposes: { code: s.rest },
  contains: {
    test: w.files('**/*.test.ts', { using: [s.rest, required.testRunner.runner], externals: ['vite-plus/*'] }),
    rest: w.files('**'),
  },
}));

const component = w.archetype('component', (s, { self, required }) => ({
  identify: { marker: '{name}.dom.ts' },
  requires: { testRunner, strings: w.dir(), icons: w.dir(), transition: w.files() },
  exposes: { render: s.dom, testPage: s.testPage, dsl: s.dsl },
  contains: {
    logic: w.files('*.ts', { using: [required.strings] }),
    dom: w.files('{name}.dom.ts', {
      using: [s.logic, s.subcomponent.render, required.icons, required.strings, required.transition],
    }),
    harness: w.files('*.harness.ts', { using: [s.dom, s.logic, required.testRunner.runner] }),
    testPage: w.files('*.test-page.ts', { using: [s.harness, s.subcomponent.testPage], externals: ['vite-plus/*'] }),
    dsl: w.files('*.dsl.ts', { using: [s.subcomponent.dsl, required.testRunner.contract] }),
    test: w.files('*.test.ts', {
      using: [s.logic, s.dom, s.harness, s.testPage, s.dsl, s.subcomponent.testPage, required.testRunner.runner],
      externals: ['vite-plus/*', '@playwright/*'],
    }),
    subcomponent: w.dir('{name}', self, { description: 'A component used only inside this one' }),
  },
  rules: { 'dsl-on-the-driver-contract': w.requires({ from: s.dsl, to: required.testRunner.contract }) },
}));

const ui = w.archetype('ui', (s) => ({
  provides: { strings: s.strings, icons: s.icons, transition: s.transition },
  exposes: { render: s.components.render, testPage: s.components.testPage, strings: s.strings },
  contains: {
    components: w.dir('{name}', component),
    strings: w.dir('strings', { description: "The app's words" }),
    icons: w.dir('icons'),
    transition: w.files('transition.ts'),
    test: w.files('*.test.ts', { using: [s.transition], externals: ['vite-plus/*'] }),
  },
}));

const journeys = w.archetype('journeys', (s, { required }) => ({
  requires: { testRunner },
  contains: {
    dsl: w.files('*.dsl.ts', { using: [required.testRunner.contract] }),
    rest: w.files('**', { using: [s.dsl, required.testRunner.runner] }),
  },
}));

const workingTitle = w.archetype('working-title', (s) => ({
  loose: 'deny',
  provides: { testRunner: s.testRunner },
  rules: { 'no-cycle': { types: 'count' } },   // as depcruise, which counts type imports
  contains: {
    domain: w.dir('src/domain', layer, { externals: [] }),
    ports: w.dir('src/ports', { using: [s.domain], externals: [] }),
    application: w.dir('src/application', layer, { using: [s.domain, s.ports], externals: [] }),
    adapters: w.dir('src/adapters', layer, { using: [s.domain, s.ports], externals: ['*'] }),
    methods: w.dir('src/methods', { using: [s.domain], externals: [], description: 'Method definitions as data' }),
    ui: w.dir('src/ui', ui, { using: [s.application], externals: [] }),
    styles: w.files('src/*.css'),
    shell: w.files('src/shell.ts', { using: [s.application, s.ui.strings] }),
    app: w.files(['src/main.ts', 'src/app.ts'], {
      using: [s.application, s.adapters, s.ports, s.methods, s.ui.render, s.ui.strings, s.shell, s.styles],
      externals: ['virtual:*'],
    }),
    testRunner: w.dir('src/test-helpers', testRunner, {
      using: [s.domain, s.application, s.adapters, s.methods, s.app, s.shell, s.ui.render, s.ui.testPage],
      externals: ['*'],
    }),
    e2e: w.dir('e2e', journeys, {
      using: [s.adapters, s.ui.testPage],
      externals: ['*'],
      description: 'Journeys against the built app',
    }),
    lint: w.dir('lint', layer, { externals: ['*'] }),
    tooling: w.files(['*.ts', 'scripts/**/*.ts'], { using: [s.lint], externals: ['*'] }),
  },
}));

export default defineConfig({ root: workingTitle });
```

How some edges come out:

| Edge | Verdict | Why |
| --- | --- | --- |
| `project/project.dom.ts` → `project/graph/graph.dom.ts` | ✅ | `dom` uses `s.subcomponent.render` |
| `project/project.dom.ts` → `project/graph/card/card.dom.ts` | ❌ | `card` is inside `graph`, and `graph` doesn't expose it |
| `project/graph/graph.dom.ts` → `project/panel/panel.dom.ts` | ❌ | siblings: `subcomponent` doesn't list itself |
| `project/graph/card/card.dom.ts` → `icons/open-beside.dom.ts` | ✅ | `dom` uses `required.icons`, which `ui` provides |
| `project/graph/card/card.ts` → `icons/open-beside.dom.ts` | ❌ | `logic` uses only strings |
| `project/graph/card/card.ts` → `project/graph/card/card.dom.ts` | ❌ | same unit, but `logic` doesn't use `dom` |
| `project/graph/card/card.dsl.ts` → `test-helpers/playwright.driver.ts` | ❌ | `dsl` uses only the runner's `contract` |
| `project/graph/graph.component.test.ts` → `project/graph/card/card.test-page.ts` | ✅ | `test` uses `s.subcomponent.testPage` |
| `src/app.ts` → `project/project.dom.ts` | ✅ | `app` uses `ui.render`, which holds the top-level components |
| `src/app.ts` → `project/graph/card/card.dom.ts` | ❌ | `card` isn't in `ui.render` |
| `project/graph/graph.ts` → `project/graph/card/card.ts` (type only) | ❌ | `card` doesn't expose `logic` |
| `project/project.dom.ts` → `src/shell.ts` (type only) | ❌ | a child never reaches its parent |
| `domain/project.ts` → `test-helpers/staging.ts` | ❌ | domain's code uses nothing; only its tests use the runner |

What fits:

- Layer direction, a component reached only through its render file, logic kept off the dom, drivers kept out of
  languages, the required driver-contract import, and cycles all map directly. The first three depcruise rules
  become `using` lists, with no inline rule. `ui/icons` has no `icons.dom.ts`, so the marker leaves it out of
  `components`.
- The nesting is the reach: a component reaches only its direct children, and `icons`, `strings` and `transition`
  are what `ui` provides to every component at any depth. Utilities stay one-directional, since they use nothing.
  No sibling component imports exist in the code, and the config refuses them.
- Only tests reach test code and the runner, because only test parts list them. That's stricter than depcruise,
  which forbade only drivers, languages and harnesses.
- `app` lists exactly what it wires together, and reaches only the top-level components.
- The ui reaching a port through application's re-export is a `dependency-direction` finding on each ui importer,
  since edges resolve to the declarer, and a `no-cross-unit-reexport` finding on application.

What doesn't fit well, and what it says about the structure:

- `src/test-helpers/` reaches into `card` (`graph-page.ts` and its neighbours import `card.ts` and
  `card.test-page.ts`), which the config refuses: `card` is private to `graph`. That is the structure smell the
  planned move fixes. Once each component's harness, test page and driver live in its folder, they are parts of the
  component, and only the generic runner stays in `test-helpers`.
- `graph.ts`, `graph.test.ts` and `graph.test-page.ts` import `CardLook` and `cardLooks` from `card.ts`, which is
  private to `card`. Either `card` exposes them, such as a `types` part holding `card.types.ts`, or `graph` stops
  needing them.
- `project.dom.ts`, `project.harness.ts` and `project.component.test.ts` import `TheShell`, `NewVersion` and
  `renderShell` from `src/shell.ts`, above them. The config could make the root provide `shell` and `component`
  require it, but a component that requires the app's shell is the smell. The shell's contract belongs below both,
  in `ports` or the application.
- Every folder whose tests use the runner needs an archetype with a `test` part, which is what `layer` is for. Tests
  cut across the tree; overlays could add them in one place later.
- The parts for `e2e/`, `lint/` and the root's files are guesses from the folder docs.

The four layers could become a reusable `hexagon` archetype once a second project wants one.

### Weaver

Weaver has its own layers: ports at the bottom, an engine tier, operations, a daemon that dispatches, and plugins as
slices. Layers expose all of their code, so only `using` limits reach.

```ts
const layer = w.archetype('layer', (s, { required }) => ({
  requires: { testHelpers: w.dir() },
  exposes: { code: s.rest },
  contains: {
    test: w.files('**/*.test.ts', { using: [s.rest, required.testHelpers], externals: ['vitest'] }),
    rest: w.files('**'),
  },
}));

const plugins = w.archetype('plugins', (s) => ({
  contains: { plugin: w.dir('{name}', layer, { description: 'One framework: detection, engine, helpers' }) },
}));

const weaver = w.archetype('weaver', (s) => ({
  loose: 'deny',
  provides: { testHelpers: s.testHelpers },
  contains: {
    ports: w.dir('src/ports', layer, { externals: ['node:*'] }),
    domain: w.dir('src/domain', layer, { using: [s.ports], externals: ['node:path'] }),
    utils: w.dir('src/utils', layer, { using: [s.domain, s.ports], externals: ['*'] }),
    tsEngine: w.dir('src/ts-engine', layer, { using: [s.domain, s.ports, s.utils, s.operations], externals: ['*'] }),
    operations: w.dir('src/operations', layer, { using: [s.domain, s.ports, s.utils, s.tsEngine], externals: ['node:path'] }),
    plugins: w.dir('src/plugins', plugins, { using: [s.domain, s.ports, s.utils, s.tsEngine, s.operations], externals: ['*'] }),
    daemon: w.dir('src/daemon', layer, { using: [s.domain, s.ports, s.utils, s.tsEngine, s.operations, s.plugins, s.adapters], externals: ['*'] }),
    adapters: w.dir('src/adapters', layer, { using: [s.daemon, s.ports, s.utils], externals: ['*'] }),
    testHelpers: w.dir('src/__testHelpers__', { using: [s.domain, s.ports, s.utils, s.tsEngine, s.operations, s.plugins], externals: ['*'] }),
  },
}));

export default defineConfig({ root: weaver, tsconfig: 'tsconfig.warp.json' });   // see below
```

What fits: the tiers, and plugins as slices: the `plugin` part doesn't list itself, so a Svelte plugin couldn't
import the Vue one. `externals: ['node:path']` on domain and operations replaces `domain-purity.test.ts` and
`operations-purity.test.ts`.

What doesn't, mostly design smells the model brings out rather than gaps in it:

- `operations/types.ts` is a contract the engines and plugins import, and `adapters/schema.ts` is one the daemon
  imports. So `tsEngine` and `operations` use each other, as do `daemon` and `adapters`, and `unit-cycle` reports
  both. Exposing a `contract` part from `operations` would narrow what `tsEngine` reaches, but the loop stays until
  those files move to their own part.
- `ports/` holds `NodeFileSystem` and `InMemoryFileSystem` beside the `FileSystem` interface, and `filesystem.ts`
  re-exports the Node one. Saying "ports hold contracts" would need contract and implementation parts inside
  `ports`, and the re-export would become a `no-cross-unit-reexport` finding.
- `operations` imports `safe-regex2`, which its `externals` reports. That needs a decision, not a config change.
- Weaver's `tsconfig.json` leaves tests out and `tsconfig.test.json` holds only tests, so modelling both needs a
  tsconfig that includes both. Either Warp accepts a list of tsconfigs or the project adds one.
- `src/cli-workspace-default.integration.test.ts` sits at the root of `src`, in no part, and is `unclassified`.

### Warp itself

Warp's own package, still at `fitness/` in snippets.

```ts
const rule = w.archetype('rule', (s) => ({
  exposes: { rule: s.rest },
  contains: {
    test: w.files('*.test.ts', { using: [s.rest], externals: ['node:*'] }),
    rest: w.files('*.ts'),
  },
}));

const rules = w.archetype('rules', (s) => ({
  contains: {
    shared: w.files('shared.ts'),
    index: w.files('index.ts', { using: [s.rule] }),
    rule: w.dir('{id}', rule, { using: [s.shared] }),
  },
}));

const model = w.archetype('model', (s) => ({
  contains: {
    core: w.files('*.ts'),
    rules: w.dir('rules', rules, { using: [s.core] }),
  },
}));

const warp = w.archetype('warp', (s) => ({
  loose: 'deny',
  contains: {
    model: w.dir('src/model', model, { externals: ['node:path'] }),
    app: w.dir('src/app', { using: [s.model], externals: ['node:*'] }),
    reporters: w.dir('src/reporters', { using: [s.model] }),
    adapters: w.dir(['src/analysis', 'src/config', 'src/git'], { using: [s.app, s.model], externals: ['*'] }),
    entry: w.files(['src/cli.ts', 'src/builtins.ts'], { using: [s.adapters, s.reporters, s.app, s.model] }),
    api: w.files('src/index.ts', { using: [s.model], rules: { 'no-cross-unit-reexport': { allow: [s.model] } } }),
    integrations: w.dir('integrations'),
    tests: w.files('test/*.ts', {
      using: [s.model, s.app, s.reporters, s.adapters, s.entry, s.api, s.integrations],
      externals: ['node:*'],
      description: 'Tests against the public units',
    }),
  },
}));

export default defineConfig({ root: warp });
```

What fits, and says more than today's kinds: the model's core can't import the rules nested inside it, rules can't
import each other (only `shared.ts`), and the three adapter folders are separate units that may not import each
other. That's true today but not enforced. Each rule's tests reach its private files; the tests in `test/` are their
own part, since they live apart from the code.

What doesn't fit well:

- Tests in `test/` reach internals such as `rules/shared.ts` because `model` exposes everything. A separate test tree
  gets less from the model than colocated tests.
- "Every rule folder has a README.md" is a rule about the file system, not imports. Out of scope for now.

### NestJS

A Nest app is a set of feature modules, each a folder with `{name}.module.ts`, holding controllers, services,
repositories and DTOs, and importing other modules through what they export.

```ts
const nestModule = w.archetype('nest-module', (s, { self, required }) => ({
  identify: { marker: '{name}.module.ts' },
  requires: { common: w.dir() },
  exposes: { api: [s.module, s.service, s.dto] },
  contains: {
    module: w.files('{name}.module.ts', { using: [s.controller, s.service, s.repository, s.submodule.api] }),
    controller: w.files('*.controller.ts', { using: [s.service, s.dto, required.common] }),
    service: w.files('*.service.ts', { using: [s.repository, s.entity, s.dto, s.submodule.api, required.common] }),
    repository: w.files('*.repository.ts', { using: [s.entity] }),
    entity: w.files('*.entity.ts'),
    dto: w.dir('dto'),
    test: w.files('**/*.spec.ts', {
      using: [s.module, s.controller, s.service, s.repository, s.entity, s.dto],
      externals: ['@nestjs/testing', 'jest'],
    }),
    submodule: w.dir('{name}', self),
  },
}));

const nestApp = w.archetype('nest-app', (s) => ({
  loose: 'deny',
  provides: { common: s.common },
  contains: {
    common: w.dir('src/common'),
    modules: w.dir('src/{name}', nestModule, { using: [s.modules.api] }),
    app: w.files(['src/main.ts', 'src/app.*.ts'], { using: [s.common, s.modules.api] }),
    e2e: w.dir('test', { using: [s.app], externals: ['supertest', 'jest'] }),
  },
}));
```

What fits: a module is a unit found by its marker, and `api` stands in for its `exports`, so a module reaches
another's service and DTOs but never its controller or repository. Controllers go through services, because
`controller` doesn't list `repository`. Modules that import each other (Nest's `forwardRef`) are a `unit-cycle`.

What doesn't: Nest's real boundary is the `@Module` metadata, which Warp doesn't read. A module that imports a
service's class but doesn't list its module in `imports` passes here and fails at run time. Apps laid out by type
(`controllers/`, `services/`) need a different config, with parts doing the work of units.

### Shared component library

A library of components above the app's own, which app components import and which imports nothing from the app.
It reuses working title's `component` archetype.

```ts
const designSystem = w.archetype('design-system', (s) => ({
  provides: { icons: s.icons, tokens: s.tokens },
  exposes: { render: s.components.render, testPage: s.components.testPage },
  contains: {
    components: w.dir('{name}', component),
    icons: w.dir('icons'),
    tokens: w.files('*.css'),
  },
}));

// in the app's parts
designSystem: w.dir('src/design-system', designSystem, { externals: [] }),
ui: w.dir('src/ui', ui, { using: [s.application, s.designSystem.render] }),
```

What fits: both trees use one `component` archetype, so they share its parts and surfaces. The direction is one-way
because nothing in the library uses `ui`. A library component's subcomponents stay private to it. Each tree gets
its own icons from its nearest provider.

What doesn't:

- `component` requires `strings` and `transition`, which the library doesn't provide, so the config is refused
  until it does. A library usually has no app strings, so it wants a component archetype with fewer requirements,
  and the two archetypes share their parts through a plain function.
- A library component only one app component uses still sits in the library. Export use (#6) can show that as a
  fan-in of one, but nothing in the structure flags it.

Folders holding several components side by side stay out of scope: they would need units made of file groups.

## Migration

- `kinds` is replaced. Each kind becomes a files part of the root with its globs, its `dependsOn` as `using`, and its
  `rules`. That's mechanical: `warp migrate-config` prints it, and the project nests parts by hand afterwards.
- `exclude` is removed; the tsconfig decides which files are read. Today's configs exclude tests, so the first run
  after migrating will classify test files, which need parts. Projects whose tsconfig leaves tests out
  need a tsconfig that holds them.
- Overlaps between kinds, which order resolved silently, now resolve by specificity or fail as equal-specificity
  errors. A flat migration keeps globs as they are, so expect a few on the first run.
- Today "a kind may import itself" covers every file in the kind, and a files part still does. Two units of one dir
  part need `using: [<own part>]` to meet. A flat migration makes one part per kind, so nothing changes until a dir
  part uses a placeholder.
- Keys of existing rules keep their form (`rule:file->file`), so the first diff after migrating is quiet apart from
  the renamed rule (`no-cross-kind-reexport` to `no-cross-unit-reexport`). The diff cache key already includes the
  tool's digest, so old findings aren't reused.
- Plugins use `unit` and `model.unitOf` in place of `RuleContext.kind` and `kindOf`. The only plugin today, the test
  fixture modelled on working title, becomes an inline rule.
- Ruleset overlays move from `kinds: { x: { rules } }` to `parts: { 'x': { rules } }`; `migrate-config` rewrites them.

## Delivery

1. Model: archetype types, finding units on the file system, `unclassified`, specificity and its errors,
   `warp model`, `migrate-config`. Existing rules run on `unit` through a shim.
2. Rule contract: scopes, `ModelView`, phase and `--phase`. Port the built-in rules.
3. Structure: parts, surfaces, `using`, requires and provides with their checks, inline rules (`w.deny`,
   `w.requires`), `no-cross-unit-reexport`, `unit-cycle`, `no-cycle`. Working title's config lands here, reporting beside depcruise.
4. Queries: `where` and `may`. Try them from omp on working title before going further, so a real consumer shapes
   what follows.
5. Facts: external edges and assets, then `unit-externals`.
6. Facts: exports, then export use (#6) and export surface (#5).
7. Facts: calls, then #4a and #4b. Naming anonymous callbacks by their call lands with this.

## Decided

1. **A child never reaches its parent.** An archetype is used in many places, so it can't name a parent. What a
   child needs from above, it requires, and an ancestor provides.
2. **Phase and rulesets both stay.** `phase` is the rule's default, and rulesets are the project's override.
3. **Per-function rules stay per function.** `cognitive-complexity` and `function-cohesion` take thresholds per part.
   Whether they roll up into unit measures is decided later, with working title's data.
4. **No severity.** The project decides what fails, and the diff ratchet covers the rest.
5. **No oxlint or Biome adapter.** A Warp language server is a possible later path for editor feedback, whatever
   the linter.
6. **Architectures not laid out in folders are a known limit,** such as a boundary that exists only in a DI container
   or a package's `exports` map. Files parts cover naming inside units, and `match` covers folders a marker can't.
   Folders holding several components side by side are out of scope too, since they would need units made of file
   groups. The [NestJS](#nestjs) and [shared component library](#shared-component-library) cases test how far the
   model goes.
7. **Type imports are imports.** They obey `using` and surfaces. A unit exposes types through a public file, a types
   file in an exposed part, or a barrel. The type/value distinction stays only in the cycle rules' `types` option.
8. **Parts replace roles.** Every file belongs to one part, and each part says what it uses. A folder that is all
   test code (`e2e/`) is an archetype whose parts are all test code.
9. **`using` is the only permission.** Parts of one unit meet only through `using`, a parent reaches a child only
   through what it exposes, and requirements are typed by archetype and checked against providers before any file
   is read.

## Noted concerns

- **Tests repeat in every archetype that holds them.** Without roles, a cross-cutting concern is a part in each
  archetype (`layer`, `component`, `ui`). Overlays could add a part to every archetype at once.
- **Reach comes from two directions.** A file's part lists what it uses, and every dir part above it adds its own
  `using`. `where` has to show each source, or reading reach means reading the chain.
- **TypeScript inference is the biggest technical risk:** typing `s` from the callback's own return, nested surface
  references such as `s.ui.render` (which need `ui`'s exposes), `required.testRunner.contract` (which needs the
  required archetype's exposes), and lazy self-references through `self`. If inference won't do it, the fallback is
  naming parts before the callback.
- **Callbacks mean the config is data only after it runs.** `--print-config` shows the result, but the source can't
  be read statically, and `match` functions and plugin rules stay executable.

## Next step

A spike before more design: the builders with real types, unit resolution, and edge verdicts on working title,
checked against the table above, and the NestJS and shared component library configs against sample projects. It
tests the riskiest part (inference) and the core semantics together.
