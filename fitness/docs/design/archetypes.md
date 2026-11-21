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
| **Slot** | A named place inside a parent archetype, filled by an archetype. Slots are what `dependsOn` refers to. | `ui`, `domain`, `component` inside `ui` |
| **Unit** | An instance of a slot in the code: a folder or a group of files. Its id is its path. | `src/ui/graph` |
| **Role** | A file's purpose within its unit, given by its name. Roles are declared on an archetype and apply to every unit below it. | `test`, `dom`, `dsl` |
| **Edge** | One import between two files, as analysis resolved it. The rule contract calls a file a module. | `graph.ts` → `card.dom.ts` |
| **Rule** | A check over files, units or the whole graph, against the model. It reports findings. | `dependency-direction` |
| **Query** | A question asked of the model rather than of the code's findings. | `fitness where <file>` |

How they relate:

```
config                         code
──────                         ────
archetype ──used by──► slot ──resolves to──► unit ──contains──► files (each with a role)
                        │                                          │
                        └── dependsOn, externals, surface ─────────┤
                                                                   ▼
                                                    edges between files
                                                                   │
                          rules judge edges and units against the slots ──► findings
                          queries read the same model ──► answers for agents
```

An archetype is a type and a slot is a use of it, the way a class is used by a field. The same `component`
archetype fills the `component` slot in `ui` and, recursively, in each component. A slot's settings (`dependsOn`,
`externals`, `rules`) belong to that place in the tree, so one archetype can be used in two places with different
neighbours.

## Config

A small example. The full working title config is under [Validation](#working-title).

```ts
import { archetype, defineConfig, deny } from 'fitness';

const component = archetype('component', {
  identify: { marker: '{name}.dom.ts' },
  surface: '{name}.dom.ts',
  contains: () => ({ component: { use: component, dependsOn: ['component'] } }),
});

export default defineConfig({
  root: archetype('app', {
    roles: { test: '**/*.test.ts', dom: '**/*.dom.ts' },
    contains: {
      domain: { dir: 'src/domain', dependsOn: [], externals: [] },
      application: { dir: 'src/application', dependsOn: ['domain'], externals: [] },
      ui: {
        dir: 'src/ui',
        dependsOn: ['application'],
        use: archetype('ui', {
          contains: { component: { use: component, dependsOn: ['component'] } },
          edgeRules: { 'logic-not-on-the-dom': deny({ from: { roleNot: ['dom', 'test'] }, to: { role: 'dom' } }) },
        }),
      },
    },
  }),
});
```

Read it as: the project holds a domain, an application and a ui. The ui holds components, found by a
`<folder>.dom.ts` file. Components may import each other only through that file, and a component may hold more
components. Inside ui, only `dom` and test files may import a `dom` file.

### Types

```ts
interface Archetype {
  name: string;
  identify?: Identify;           // how a slot using it finds instances, unless the slot says
  surface?: Surface;             // default 'any'
  roles?: Record<string, string | string[] | Role>;
  contains?: Record<string, Slot> | (() => Record<string, Slot>);   // a function allows recursion
  edgeRules?: Record<string, EdgeRule>;   // apply to every edge that starts inside the unit
  loose?: 'allow' | 'deny';      // own files outside any slot; default 'allow', the root defaults to 'deny'
  rules?: RuleSettings;
  description?: string;          // for agents choosing where code goes
}

interface Slot extends Partial<Identify> {
  use?: Archetype;               // default: an archetype with nothing inside
  dependsOn?: string[] | '*';    // sibling slots it may import; default []
  externals?: string[];          // packages it may import; [] none, ['*'] any; unset adds no limit
  cycles?: 'allow';              // tolerate a known cycle among this slot's siblings
  rules?: RuleSettings;          // applied after the archetype's
  description?: string;
}

interface Role {
  files: string | string[];
  dependsOn?: string[];          // slot paths its files may also import, such as 'src.testHelpers'
  externals?: string[];          // packages its files may also import, such as 'vitest'
}

type Identify =
  | { dir: string | string[] }   // relative to the parent unit; may hold {captures}: 'ui/{name}'
  | { files: string | string[] } // a group of files, one unit: ['main.ts', 'app.ts'], '*.ts'
  | { marker: string }           // any folder below the parent holding a matching file
  | { match: (dir: string, chain: UnitView[]) => false | Record<string, string> };

type Surface = 'any' | string | string[] | { internal: string };   // { internal: 'internal' }: all but that folder

interface FitnessConfig {
  tsconfig?: string;             // default 'tsconfig.json'; its program is what fitness reads
  generated?: string[];          // globs: in the model, never reported on
  plugins?: Record<string, Plugin>;
  rules?: RuleSettings;
  root: Archetype;
}
```

`kinds` and `exclude` go. A `dir` without a placeholder is one unit; with one, it is a unit per match, and a list of
dirs is a unit per entry. `files` is always one unit.

## Finding units

1. The root unit is the config's folder.
2. For each unit, each slot finds its instances among the unit's own files and folders: `dir` and `files` slots
   first, then `marker`, then `match`. A marker matches the shallowest folder. Deeper matches are found when
   fitness looks inside that unit, if its archetype contains the slot.
3. If two slots of one parent claim the same folder or file, that is an `ambiguous-unit` finding. The slot declared
   first takes it, so checking goes on. Today the first glob wins silently, which hides overlaps.
4. A file belongs to its deepest unit. Its role is the first role that matches, nearest archetype first.
5. A file left among the own files of a unit with `loose: 'deny'` is `unclassified`, as today.

Finding units reads the file system, not only the TS program: a marker can be a file the program doesn't hold,
such as `component.json`.

**Captures.** `{name}` matches one path segment. An archetype's templates (`marker`, `surface`) see only the
unit's own captures, never an ancestor's, so nested components with their own `{name}` don't collide. A `match`
function gets the whole chain for anything else. Unit ids are full paths, so a query never needs captures to tell
units apart.

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

### How an edge between units is judged

For an edge from file A to file B, take each file's chain of units from the root, and their deepest shared unit L.
Let `a` and `b` be the children of L that hold A and B, or none when the file is one of L's own files.

| Case | Allowed when |
| --- | --- |
| Same unit (`a` and `b` are both none) | always, apart from edge rules |
| Parent to child (`a` is none) | B is on the surface of every unit from `b` down to B's unit |
| Child to parent's own files (`b` is none) | never. Give those files a `files` slot and depend on it. |
| Siblings in different slots | `a`'s slot lists `b`'s slot in `dependsOn`, or A's role does, and the surface chain holds |
| Siblings in the same slot | the slot lists its own name in `dependsOn`, and the surface chain holds |

Then every edge rule on a unit in A's chain must pass.

**Constraints intersect.** Every check that applies must pass, so no level of the tree can allow what another
forbids. `dependsOn` lists only matter at one level, so they never conflict. Edge rules, surfaces and `externals`
stack, and intersecting them is what keeps a preset's guarantees when it's nested inside another archetype.

**Rule options cascade, nearest wins.** Thresholds work the other way: the rule's defaults, then the root's `rules`,
then each archetype and slot down the chain, then the role. Options resolve for the file a finding is reported on.
Structure is a set of invariants, and thresholds are tuning.

**Edge rules.** `deny({ from, to })` forbids edges between selected files, and `requires({ from, to })` reports a
file matching `from` that has no edge to `to`. Selectors are `{ role?, roleNot?, in?, notIn?, file? }`, where `in`
and `notIn` take slot paths such as `src.testHelpers`.

**Edge kinds.** Edges keep whether they are type-only and whether they re-export, but the config doesn't match on
them generally. The rules where type imports change the answer take `types: 'count' | 'ignore'`:
`dependency-direction`, `unit-surface`, `unit-externals` and both cycle rules. Re-exports have their own rule.

**Externals.** An external edge must be allowed at every level of A's chain that sets `externals`. At each level,
the packages A's role adds count as part of that level's list, just as a role's `dependsOn` adds to its slot's. Entries are package names or globs: `node:*`, `@aws-sdk/*`. Unset means that level adds no
limit, so a list applies to the slot's whole subtree, and a child can only narrow it. In the `hexagon` preset only
`adapters` may import packages. This is a property of the slot, not general package linting.

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
| direction between siblings, parent and child | `dependency-direction` |
| the surface chain | `unit-surface` (new) |
| a named entry in `edgeRules` | `edge-rules/<name>` |
| re-exporting another unit's names | `no-cross-unit-reexport` (renamed; `allow` takes slot names) |
| a package the unit may not import | `unit-externals` (new) |
| a loop between units | `unit-cycle` (new) |
| a loop between files | `no-cycle` (new) |
| two slots claiming one folder | `ambiguous-unit` (new, from the model) |
| a file in no unit | `unclassified` (from the model, as today) |

## Tests

Test code is code, and the model treats it that way: test files belong to units, have roles, and obey `dependsOn`,
surfaces and externals like everything else.

- A test file belongs to the unit it sits in, which is normally the unit it tests. That's how it reaches the unit's
  internals: they are in the same unit, so no surface applies.
- "Test" is a role a file has within its unit. A role can add slots (`dependsOn`) and packages (`externals`) its
  files may also import. That's how test files reach `src/test-helpers` and the test runner while app code can't:
  a plain direction rule.
- Code that tests across units, such as working title's language, driver and harness files, is reached through
  surfaces like any other code. A component's surface lists its render file and its test-facing files, and an edge
  rule says only test code may import those.
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
  slot: string;               // slot path: 'src.ui.component'
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
  test fixture modelled on working title, which becomes an entry in `edgeRules`.

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

Overlays still change rules only. They name units by slot path and roles by name:

```ts
export const edit = [base, {
  rules: { 'cognitive-complexity': { max: 12 } },
  units: { 'src.ui.component': { rules: { 'module-cohesion': false } } },
  roles: { test: { rules: { 'function-cohesion': false } } },
}] satisfies Ruleset;
```

A slot path names every unit of that slot at any depth, since recursive components share one slot. An overlay that
names a slot the base lacks is refused, as an unknown kind is today. `--print-config` prints the slot tree with
each slot's resolved rules.

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
  "unit": { "id": "src/ui/graph", "slot": "src.ui.component", "archetype": "component", "captures": { "name": "graph" } },
  "chain": [".", "src", "src/ui", "src/ui/graph"],
  "role": null,
  "onSurface": false,
  "mayImport": [
    { "slot": "src.ui.component", "units": ["src/ui/card", "src/ui/panel", "src/ui/project", "src/ui/your-projects"], "surface": ["{name}.dom.ts", "{name}.dsl.ts", "{name}.harness.ts", "{name}.test-page.ts"], "types": "ignore" },
    { "slot": "src.ui.strings", "units": ["src/ui/strings"], "surface": "any" },
    { "slot": "src.ui.icons", "units": ["src/ui/icons"], "surface": "any" },
    { "slot": "src.application", "units": ["src/application"], "surface": "any" }
  ],
  "externals": [],
  "mayNotImport": [
    { "slot": "src.domain", "because": "src.ui dependsOn application only" },
    { "slot": "src.testHelpers", "because": "only roles test, test-page, harness, dsl and driver depend on it" },
    { "role": "dom", "because": "edge-rules/logic-not-on-the-dom" },
    { "role": ["dsl", "driver", "harness", "test-page"], "because": "edge-rules/test-code-only-from-tests" }
  ],
  "importableBy": [{ "unit": "src/ui/graph" }]
}
```

`may` returns the verdict and every check behind it (`dependency-direction`, `unit-surface`, each edge rule), so
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
| Surface | barrel `index.ts`, or an `internal/` folder | entry-point rule | no | chosen per archetype |
| File categories | no | yes | regex | roles, inherited |
| Type and value edges | no | yes | yes | yes, as a `types` option |
| Re-export chains | no | no | no | resolved to the declarer |
| Required imports | no | no | yes | `requires` |
| Cycles | no | no | files | files and units |
| External packages | no | yes | yes | per slot |
| Unit measures | no | no | no | yes |
| Queries | no | no | no | yes |

Borrowed: from boundaries, file categories (roles) apart from units, and parent, child and sibling relationships;
from Sheriff, the placeholder syntax and barrel and internal-folder surfaces, as choices rather than a convention.
No convention is required: `index.ts` is one possible marker or surface, never assumed.

## Validation

Configs written against each repo as of 2026-11-20. The `hexagon` preset as proposed:

```ts
// fitness/presets
export const hexagon = (slots: Record<string, Partial<Slot> | null> = {}) =>
  archetype('hexagon', {
    loose: 'deny',
    contains: merge({
      domain: { dir: 'domain', dependsOn: [], externals: [] },
      ports: { dir: 'ports', dependsOn: ['domain'], externals: [] },
      application: { dir: 'application', dependsOn: ['domain', 'ports'], externals: [] },
      adapters: { dir: 'adapters', dependsOn: ['domain', 'ports'], externals: ['*'] },
      ui: { dir: 'ui', dependsOn: ['application', 'domain'], externals: [] },
    }, slots),            // shallow merge per slot; null removes a slot
  });
```

### Working title

This replaces every rule in `.dependency-cruiser.mjs`, `no-circular` included. Its tsconfig includes `**/*.ts`, so
the config models `e2e/`, `lint/` and the root's own files too.

```ts
import { archetype, defineConfig, deny, requires } from 'fitness';
import { hexagon } from 'fitness/presets';

const testRoles = ['test', 'test-page', 'harness', 'dsl', 'driver'];
const testRole = (files: string) => ({ files, dependsOn: ['src.testHelpers'], externals: ['vite-plus/*', '@playwright/*'] });

const component = archetype('component', {
  identify: { marker: '{name}.dom.ts' },
  // Another component reaches it only through render<Component> and its test-facing files.
  surface: ['{name}.dom.ts', '{name}.dsl.ts', '{name}.harness.ts', '{name}.test-page.ts'],
  contains: () => ({ component: { use: component, dependsOn: ['component'], description: 'A component used only inside this one' } }),
});

const ui = archetype('ui', {
  rules: { 'unit-surface': { types: 'ignore' } },   // types from a component's plain modules are fine
  contains: {
    component: { use: component, dependsOn: ['component', 'strings', 'icons', 'transition'] },
    strings: { dir: 'strings', description: "The app's words" },
    icons: { dir: 'icons' },
    transition: { files: 'transition.ts' },
  },
  edgeRules: {
    'logic-not-on-the-dom': deny({ from: { roleNot: ['dom', 'test', 'harness'] }, to: { role: 'dom' } }),
  },
});

export default defineConfig({
  rules: { 'no-cycle': { types: 'count' } },   // as depcruise, which counts type imports
  root: archetype('working-title', {
    loose: 'deny',
    roles: {
      test: testRole('**/*.test.ts'),
      'test-page': testRole('**/*.test-page.ts'),
      harness: testRole('**/*.harness.ts'),
      dsl: testRole('**/*.dsl.ts'),
      driver: testRole('**/*.driver.ts'),
      'driver-contract': 'src/test-helpers/driver.ts',
      dom: '**/*.dom.ts',
    },
    edgeRules: {
      'dsl-not-on-a-driver': deny({ from: { role: 'dsl' }, to: { role: 'driver' } }),
      'test-code-only-from-tests': deny({
        from: { roleNot: testRoles, notIn: ['src.testHelpers', 'e2e'] },
        to: { role: ['dsl', 'driver', 'driver-contract', 'harness', 'test-page'] },
      }),
      'dsl-on-the-driver-contract': requires({ from: { role: 'dsl' }, to: { role: 'driver-contract' } }),
    },
    contains: {
      src: {
        dir: 'src',
        use: hexagon({
          ui: { dependsOn: ['application'], use: ui },
          methods: { dir: 'methods', dependsOn: ['domain'], externals: [], description: 'Method definitions as data' },
          startup: { files: ['main.ts', 'app.ts', 'shell.ts', '*.css'], dependsOn: '*', externals: ['virtual:*'] },
          testHelpers: { dir: 'test-helpers', dependsOn: '*', externals: ['*'] },
        }),
      },
      e2e: { dir: 'e2e', dependsOn: ['src'], externals: ['*'], description: 'Journeys against the built app' },
      lint: { dir: 'lint', externals: ['*'] },
      tooling: { files: ['*.ts', 'scripts/**/*.ts'], dependsOn: ['lint'], externals: ['*'] },
    },
  }),
});
```

What fits:

- Layer direction, a component reached only through its render file (a surface), logic-not-on-the-dom, the
  language and driver rules, the required driver-contract import, and cycles all map directly. `ui/icons` has no
  `icons.dom.ts`, so the marker rightly leaves it out of `component`.
- Nested components (`your-projects` holding `project-list`, `projects-folder` and `start-a-project`) come from the
  recursive slot. `graph` importing `project-list.dom.ts` fails the surface chain at `your-projects`, which
  depcruise's one-level regex misses.
- "App code may not import test helpers" is now a direction rule: only test roles depend on `src.testHelpers`.
  That's stricter than depcruise, which forbade only drivers, languages and harnesses.
- The ui reaching a port through application's re-export is a `dependency-direction` finding on each ui importer,
  since edges resolve to the declarer, and a `no-cross-unit-reexport` finding on application.
- `startup`'s CSS imports land in its own file group, so the root stays strict.

What doesn't:

- Working title's `ui` depends on application only, while the preset's `ui` also allows domain. Overriding is easy,
  but it means a preset is a starting point, not a guarantee.
- Cross-component test reach was exempt in depcruise. Here a component's test-facing files are on its surface, which
  is more explicit but needs checking against the code. The slots for `e2e/`, `lint/` and the root's files are
  guesses from the folder docs.

### Weaver

Weaver is hexagonal in spirit, but its layers aren't the preset's: ports at the bottom, an engine tier, operations,
a daemon that dispatches, and plugins as slices. It doesn't use `hexagon`.

```ts
const plugin = archetype('plugin', { description: 'One framework: detection, engine, helpers' });

export default defineConfig({
  tsconfig: 'tsconfig.fitness.json',     // see below
  root: archetype('weaver', {
    roles: { test: { files: ['**/*.test.ts'], dependsOn: ['src.testHelpers'], externals: ['vitest'] } },
    contains: {
      src: {
        dir: 'src',
        use: archetype('weaver-src', {
          loose: 'deny',
          contains: {
            ports: { dir: 'ports', dependsOn: [], externals: ['node:*'] },
            domain: { dir: 'domain', dependsOn: ['ports'], externals: ['node:path'] },
            utils: { dir: 'utils', dependsOn: ['domain', 'ports'], externals: ['*'] },
            tsEngine: { dir: 'ts-engine', dependsOn: ['domain', 'ports', 'utils', 'operations'], externals: ['*'] },
            operations: { dir: 'operations', dependsOn: ['domain', 'ports', 'utils', 'tsEngine'], externals: ['node:path'] },
            plugins: {
              dir: 'plugins',
              dependsOn: ['domain', 'ports', 'utils', 'tsEngine', 'operations'],
              externals: ['*'],
              use: archetype('plugins', { contains: { plugin: { dir: '{name}', use: plugin } } }),
            },
            daemon: { dir: 'daemon', dependsOn: ['domain', 'ports', 'utils', 'tsEngine', 'operations', 'plugins', 'adapters'], externals: ['*'] },
            adapters: { dir: 'adapters', dependsOn: ['daemon', 'ports', 'utils'], externals: ['*'] },
            testHelpers: { dir: '__testHelpers__', dependsOn: '*', externals: ['*'] },
          },
        }),
      },
    },
  }),
});
```

What fits: the tiers, and plugins as slices, isolated from each other by default so a Svelte plugin couldn't
import the Vue one. `externals: ['node:path']` on domain and operations replaces `domain-purity.test.ts` and
`operations-purity.test.ts`.

What doesn't, mostly as design smells the model brings out rather than gaps in it:

- `operations/types.ts` is a contract that the engines and plugins import, and `adapters/schema.ts` is one the
  daemon imports. So `tsEngine` and `operations` depend on each other, as do `daemon` and `adapters`, and
  `unit-cycle` reports both. Moving those files to their own slot removes the loops.
- `ports/` holds `NodeFileSystem` and `InMemoryFileSystem` beside the `FileSystem` interface, and `filesystem.ts`
  re-exports the Node one. Saying "ports hold contracts" would need contract and implementation slots inside
  `ports`, and the re-export would become a `no-cross-unit-reexport` finding.
- `operations` imports `safe-regex2`, which `externals: ['node:path']` reports. That needs a decision, not a
  config change.
- Weaver's `tsconfig.json` leaves tests out and `tsconfig.test.json` holds only tests, so modelling both needs a
  tsconfig that includes both. Either fitness accepts a list of tsconfigs or the project adds one.

### Fitness

```ts
const rule = archetype('rule', { surface: ['*.ts', '!*.test.ts'] });

export default defineConfig({
  root: archetype('fitness', {
    loose: 'deny',
    contains: {
      model: {
        dir: 'src/model',
        dependsOn: [],
        externals: ['node:path'],
        use: archetype('model', {
          contains: {
            core: { files: '*.ts', dependsOn: [] },
            rules: {
              dir: 'rules',
              dependsOn: ['core'],
              use: archetype('rules', {
                contains: {
                  shared: { files: 'shared.ts' },
                  index: { files: 'index.ts', dependsOn: ['rule'] },
                  rule: { dir: '{id}', use: rule, dependsOn: ['shared'] },
                },
              }),
            },
          },
        }),
      },
      app: { dir: 'src/app', dependsOn: ['model'], externals: ['node:*'] },
      reporters: { dir: 'src/reporters', dependsOn: ['model'] },
      adapters: { dir: ['src/analysis', 'src/config', 'src/git'], dependsOn: ['app', 'model'], externals: ['*'] },
      entry: { files: ['src/cli.ts', 'src/builtins.ts'], dependsOn: ['adapters', 'reporters', 'app', 'model'] },
      api: { files: 'src/index.ts', dependsOn: ['model'], rules: { 'no-cross-unit-reexport': { allow: ['model'] } } },
      integrations: { dir: 'integrations', dependsOn: [] },
      tests: { files: 'test/*.ts', dependsOn: '*', externals: ['node:*'], description: 'Tests against the public units' },
    },
  }),
});
```

What fits, and says more than today's kinds: the model's core can't import the rules nested inside it, rules can't
import each other (only `shared.ts`), and the three adapter folders are separate units that may not import each
other. That's true today but not enforced. Tests sit in their own slot, since they live apart from the code.

What doesn't:

- The colocated `*.test.ts` files in rule folders belong to their rule's unit, as intended, but `test/*.ts` reaching
  internals such as `src/model/rules/shared.ts` goes through surfaces that are mostly `any`. A separate test tree
  gets less from the model than colocated tests.
- "Every rule folder has a README.md" is a rule about the file system, not imports. Out of scope for now.

## Migration

- `kinds` is removed, not deprecated. Each kind becomes a slot under the root with `files: <its globs>`, the same
  `dependsOn`, and its `rules`. That's mechanical: `fitness migrate-config` prints it, and the project nests slots
  by hand afterwards.
- `exclude` is removed; the tsconfig decides which files are read. Today's configs exclude tests, so the first run
  after migrating will classify test files, which need roles or slots. Projects whose tsconfig leaves tests out
  need a tsconfig that holds them. `exclude` can come back if a real need shows up.
- Overlaps between kinds, which order resolved silently, show up as `ambiguous-unit`. Expect a few on the first run.
- Today "a kind may import itself" covers every file in the kind. Inside one unit that still holds. Two units of one
  slot now need `dependsOn: [<own slot>]` to meet. A flat migration makes one unit per kind, so nothing changes until
  a slot uses a placeholder.
- Keys of existing rules keep their form (`rule:file->file`), so the first diff after migrating is quiet apart from
  the renamed rule (`no-cross-kind-reexport` to `no-cross-unit-reexport`). The diff cache key already includes the
  tool's digest, so old findings aren't reused.
- Ruleset overlays move from `kinds: { x: { rules } }` to `units: { x: { rules } }`; `migrate-config` rewrites them.

## Delivery

1. Model: archetype types, finding units on the file system, `unclassified` and `ambiguous-unit`, `generated`,
   `fitness model`, `migrate-config`. Existing rules run on `unit` through a shim.
2. Rule contract: scopes, `ModelView`, phase and `--phase`. Port the built-in rules.
3. Structure: surfaces, roles, `edgeRules`, `requires`, `unit-surface`, `no-cross-unit-reexport`, `unit-cycle`,
   `no-cycle`. Working title's config lands here, reporting beside depcruise rather than replacing it.
4. Queries: `where` and `may`. Try them from omp on working title before going further, so a real consumer shapes
   what follows.
5. Facts: external edges and assets, then `unit-externals`.
6. Facts: exports, then export use (#6) and export surface (#5).
7. Facts: calls, then #4a and #4b. Naming anonymous callbacks by their call lands with this.

## Open questions

1. **A child never imports its parent's own files.** The workaround is a `files` slot (fitness's `model.core`). The
   alternative is a `'^'` entry in `dependsOn`. Proposed: no `'^'` until a case needs it.
2. **Units of one slot are isolated by default.** They need `dependsOn: [<own slot>]` to import each other. Weaver's
   plugins and fitness's rules want isolation; working title's components opt in.
3. **Structure intersects, options cascade.** The asymmetry is deliberate, but it is a second rule to learn.
4. **Phase belongs to the rule,** with config and rulesets able to change it, rather than a shipped `edit` ruleset.
5. **Per-function rules.** `cognitive-complexity` and `function-cohesion` stay. Open: whether they also roll up into
   unit measures (worst or total per unit), so they speak to modularity as well as quality.
6. **Severity.** Every finding is equal today. Whether rules or slots set a severity, and whether `--fail` honours
   it, is undecided.
7. **Lint adapter.** Findings could appear in oxlint or Biome as well as through the hook and SARIF. Undecided
   whether that's worth an adapter.
8. **Architectures not laid out in folders or names,** such as a module boundary that exists only in a DI container
   or a package's `exports` map. A known limit: identifying units needs a path, a marker or a predicate over paths.
