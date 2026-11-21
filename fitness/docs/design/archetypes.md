# Design: archetypes

Status: proposal. No code changes yet.

Replaces flat glob `kinds` with a tree of composable unit types, and changes the rule contract so rules can see the
whole graph. One model serves three consumers: lint (findings), a query API for agents, and Weaver codemods.

## Why

`kinds` are a flat, first-match list of globs. That can't say:

- a component reaches another component only through its render file (sibling rules);
- a component nests inside another, and the inner one is private to it (containment);
- `dom` files hold no logic, and that belongs to the component, not to a global list (rules live with the thing);
- the same shape repeats across projects (presets).

The rule contract is per module (`RuleContext.module`), so rules that need the whole graph (fan-in, export use,
export surface, repeated call sequences) can't be written.

## Vision and scope

Fitness is a declared model of a codebase's modules, used to keep it modular. Checks run against the model; agent
queries and Weaver codemods read the same model. A check belongs in fitness when it is about the modules: their
boundaries, their dependencies, or a measure of a unit.

In:

- **Structure:** units, direction, surfaces, re-exports, edge rules, required edges.
- **Cycles:** between units (needs the model) and between files (cheap on the graph already built, and the
  projects don't share a linter: Weaver uses Biome, not oxlint).
- **External dependencies** of a unit (`node:fs` not in domain), later.
- **Unit measures:** cohesion, size, fan-in, export surface and use, orchestration weight.

Out:

- Generic code quality not measured per unit, such as per-function complexity. See
  [open questions](#open-questions) for what that means for `cognitive-complexity` and `function-cohesion`.
- Non-TS files (CSS, README presence).

## Concepts

| Term | Meaning |
| --- | --- |
| **Archetype** | A reusable unit type: how instances are identified, their surface, their file roles, their edge rules, and the slots they contain. |
| **Slot** | A named entry in a parent archetype's `contains`. The slot name is the vocabulary (`ports`, `component`). Siblings' `dependsOn` refers to slot names. |
| **Unit** | An instance in the code: a directory or a file group, with its slot, archetype, captures and parent. Its id is its root path (`src/ui/graph`). |
| **Own files** | A unit's files not inside any child unit. |
| **Role** | A file category (`test`, `dom`, `dsl`), from eslint-plugin-boundaries' file category. Declared on an archetype, inherited by every unit below it. |
| **Surface** | Which of a unit's files outsiders may import, split by edge kind (type or value). |
| **Edge** | One resolved import: from file, to file (declarer, after barrels), `via`, `typeOnly`, `reExport`. Already in the facts. |

## Config

```ts
import { archetype, defineConfig, deny, requires } from 'fitness';

const component = archetype('component', {
  identify: { marker: '{name}.dom.ts' },
  surface: { value: '{name}.dom.ts', type: '*.ts' },
  scaffold: ['{name}.ts', '{name}.dom.ts', '{name}.test.ts'],
  contains: () => ({ component: { use: component, dependsOn: ['component'] } }),
});

export default defineConfig({
  exclude: ['**/*.d.ts'],
  root: archetype('app', {
    roles: { test: { files: '**/*.test.ts', seesInternals: true }, dom: '**/*.dom.ts' },
    contains: {
      domain: { dir: 'src/domain', dependsOn: [], description: 'Entities and rules, no I/O' },
      application: { dir: 'src/application', dependsOn: ['domain'] },
      ui: {
        dir: 'src/ui',
        dependsOn: ['application'],
        use: archetype('ui', {
          contains: { component: { use: component, dependsOn: ['component'] } },
          edges: { 'logic-not-on-the-dom': deny({ from: { roleNot: ['dom', 'test'] }, to: { role: 'dom' } }) },
        }),
      },
    },
  }),
});
```

### Types

```ts
interface Archetype {
  name: string;
  identify?: Identify;              // default for slots that use it; a slot may override
  surface?: Surface;                // default 'any'
  roles?: Record<string, string | string[] | { files: string | string[]; seesInternals?: boolean }>;
  contains?: Record<string, Slot> | (() => Record<string, Slot>);   // a thunk allows recursion
  edges?: Record<string, EdgeRule>; // apply to every edge whose source is in this unit's subtree
  loose?: 'allow' | 'deny';         // own files outside any slot; default 'allow', root default 'deny'
  rules?: RuleSettings;             // rule settings for modules in units of this archetype
  scaffold?: string[];              // file templates, for `place` and Weaver
  description?: string;             // for agents
}

interface Slot extends Partial<Identify> {
  use?: Archetype;                  // default: an anonymous archetype with no contents
  dependsOn?: Dependency[] | '*';   // sibling slots this slot may import; default []
  shared?: true | { from: string[] };  // implicitly in every sibling's dependsOn (optionally only for these roles)
  rules?: RuleSettings;             // after the archetype's
  cycles?: 'allow';                 // tolerate a known unit cycle among this slot's siblings
  description?: string;
}

type Identify =
  | { dir: string | string[] }      // relative to the parent unit; may hold {captures}: 'ui/{name}'
  | { files: string | string[] }    // a file group, one unit: ['main.ts', 'app.ts'], '*.ts'
  | { marker: string }              // any directory below the parent holding a matching file
  | { match: (dir: string, chain: UnitView[]) => false | Record<string, string> };

type Surface = 'any' | string | string[] | { value?: string | string[]; type?: string | string[] }
  | { internal: string };           // everything except this folder: { internal: 'internal' }

type Dependency = string | { slot: string; kind?: 'type' | 'value'; files?: string | string[] };
```

`kinds` goes. `dir` with no placeholder is one unit; with a placeholder it is one unit per match. `files` is always
one unit.

## Resolving units

1. Start at the root unit (the config's directory).
2. For each unit, find each slot's instances among its own files: `dir` and `files` slots first, then `marker`, then
   `match`. A marker matches the shallowest directory; deeper ones are found when recursing into it, if its archetype
   contains that slot.
3. A directory or file claimed by two slots of the same parent is an **`ambiguous-unit`** finding. Declared order still
   decides, so checking continues. This replaces first-match-wins, which hid overlaps.
4. A file belongs to its deepest unit. Its role is the first matching role, nearest archetype first.
5. A file that is an own file of a unit with `loose: 'deny'` is **`unclassified`** (today's finding, same key).

**Captures.** `{name}` matches one path segment. Templates in an archetype (`marker`, `surface`, `scaffold`) see only
that unit's own captures. Nothing reaches an ancestor's captures; a `match` predicate gets the chain for anything
that needs it. So nested captures never collide: `your-projects` and `project-list` each have their own `{name}`.
Unit ids carry the full path, so queries need no captures to disambiguate.

## Edge semantics

For an edge A → B, take each file's unit chain (root to deepest), and the deepest common unit L. Let `a` and `b` be
the children of L holding A and B (or none, when the file is an own file of L).

| Case | Allowed when |
| --- | --- |
| Same unit (`a` and `b` both none) | always, subject to edge rules |
| Parent → child (`a` none) | B is on the surface of every unit from `b` down to B's unit |
| Child → parent's own files (`b` none) | never. Give those files a `files` slot and depend on it. |
| Siblings, different slots | `a`'s slot `dependsOn` `b`'s slot (or it is `shared`), the dependency's `kind`/`files` admit the edge, and the surface chain holds |
| Peers, same slot | the slot `dependsOn` its own name, and the surface chain holds |

Then, for every unit on A's chain, every `edges` rule whose selectors match must pass. A role with `seesInternals`
skips the surface chain but nothing else, so tests still obey layer direction.

**Conflicting constraints intersect.** Every applicable check must pass; no level can widen what another forbids.
Allow-lists (`dependsOn`) are local to one level, so they never conflict with each other. Only deny-style rules
(`edges`, surfaces) stack, and intersection is the only reading where a preset's guarantee survives being nested.

**Rule options cascade, nearest wins.** For quality thresholds, the opposite: defaults, then root `rules`, then each
archetype and slot down the chain, then the role. Structure is invariants; thresholds are tuning.

Edge selectors: `{ role?, roleNot?, in?, notIn?, file? }`, where `in` is a slot path (`src.testHelpers`).
`requires({ from, to })` reports a module matching `from` that has no edge to `to`.

Each failure is one finding per file pair per rule, as today. Which rule:

| Check | Rule id |
| --- | --- |
| sibling / parent / child direction | `dependency-direction` |
| surface chain | `unit-surface` (new) |
| a named `edges` entry | `edges/<name>` |
| re-exporting another unit's names | `no-cross-unit-reexport` (renamed; `allow` takes slot names) |
| units depending on each other in a loop | `unit-cycle` (new) |
| files depending on each other in a loop | `no-cycle` (new) |

**Cycles.** Both are project-scope rules, `phase: 'edit'` (Tarjan over the graph is linear). `unit-cycle` builds,
for each unit, the graph of its children's edges and reports each strongly connected component; so two layers that
import each other are a cycle even when no single file is. `no-cycle` does the same over files. Each reports one
finding per edge inside a component, keyed `unit-cycle:src/ui->src/application` or `no-cycle:a.ts->b.ts`, value 1:
keying on the whole component would turn every growth of a cycle into resolved plus added. Type-only edges are
left out by default (they don't load at run time) and counted with `{ types: true }`. A slot can allow a known
mutual dependency with `cycles: 'allow'`, which shows in `where` so an agent sees it is tolerated, not endorsed.

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
  verdict(edge: ImportEdge): Verdict;     // the structure decision, so custom rules reuse it
  importersOf(file: string): ImportEdge[];  // reverse index, built once
  exportsOf(file: string): ExportFacts[];
}

interface UnitView {
  id: string;                 // root path: 'src/ui/graph'
  slot: string;               // slot path: 'src.ui.component'
  archetype: string;
  captures: Record<string, string>;
  parent?: UnitView;
  children: UnitView[];
  ownFiles: string[];
  onSurface(file: string, kind: 'type' | 'value'): boolean;
}
```

- A project rule runs once and resolves options per file with `optionsFor`; `undefined` means the rule is off there.
  Export use computes fan-in for every export, then asks `optionsFor(declaringFile)`.
- `RuleContext.kind` and `kindOf` go. Plugins migrate to `unit` and `model.unitOf`. The only plugin today is
  working title's fixture rule, which becomes an `edges` entry or `no-cross-unit-reexport`.

**Facts added**

| Fact | For |
| --- | --- |
| `ModuleFacts.exports: { name, line, typeOnly, from? }[]` (`from` for re-exports) | export surface (#5), export use (#6) |
| `FunctionFacts.calls: { callee: string, line }[]`, in order, callee as the checker's symbol key | chained use (#4a), repeated call sequences (#4b) |

**Phase.** A rule declares the earliest point its findings mean something. Zero fan-in is noise mid-build, so
`export-use` is `phase: 'commit'`; per-file rules stay `edit`. `fitness diff --phase edit` skips commit-phase rules,
and the omp hook passes it. `check` and plain `diff` run everything. A config overrides a rule's phase with the
reserved option `phase`, which rulesets can set too. Phase is the rule's own knowledge; rulesets stay the project's
tuning.

## Finding keys

Diff matches findings by key, so keys must survive edits that don't change the finding.

- Grammar: `rule:subject[->object]`. Subject and object are a path, `path#symbol`, `path#Class.method`, or a unit id.
- Never in a key: slot or archetype names (renaming a slot must not churn findings), line numbers, declaration
  ordinals, option values.
- Anonymous functions: anchor on the enclosing named function and the call they're passed to,
  `src/a.ts#load>then(0)`, not `#2`. A `#n` suffix only when two anchors are identical. This closes the open
  ordinal issue.
- Unit findings key on the unit id (`module-count:src/ui/graph`); project findings on the subject
  (`export-use:src/x.ts#foo`).
- Moves: before comparing, `diff` rewrites base keys through git's rename map (`git diff -M --name-status`), so a
  moved file's findings carry over instead of showing as resolved plus added.

## Rulesets

Overlays still change rules only. They address units by slot path and roles by name:

```ts
export const edit = [base, {
  rules: { 'cognitive-complexity': { max: 12 } },
  units: { 'src.ui.component': { rules: { 'module-cohesion': false } } },
  roles: { test: { rules: { 'function-cohesion': false } } },
}] satisfies Ruleset;
```

A slot path names every unit of that slot at any depth (recursive components share one definition). An overlay that
names a slot the base lacks is refused, as unknown kinds are today. `--print-config` prints the slot tree with each
slot's resolved rules.

## Queries

The model answers "where does this go, and what may it import?" before code is written. CLI first (`--json`), the
same functions exported for an MCP tool later.

```sh
fitness model                         # the unit tree with instances
fitness where src/ui/graph/layout.ts  # a file's unit, role, surface, and what it may import
fitness may src/ui/graph/graph.ts src/domain/project.ts [--type]
fitness place component --in src/ui --name outline
```

`fitness where src/ui/graph/layout.ts --json`, against [working title's config](#working-title):

```json
{
  "file": "src/ui/graph/layout.ts",
  "unit": { "id": "src/ui/graph", "slot": "src.ui.component", "archetype": "component", "captures": { "name": "graph" } },
  "chain": [".", "src", "src/ui", "src/ui/graph"],
  "role": null,
  "onSurface": { "value": false, "type": true },
  "mayImport": [
    { "slot": "src.ui.component", "units": ["src/ui/card", "src/ui/panel", "src/ui/project", "src/ui/your-projects"], "surface": { "value": "{name}.dom.ts", "type": "*.ts" } },
    { "slot": "src.ui.strings", "units": ["src/ui/strings"], "surface": "any" },
    { "slot": "src.ui.icons", "units": ["src/ui/icons"], "surface": "any" },
    { "slot": "src.application", "units": ["src/application"], "surface": "any" }
  ],
  "mayNotImport": [
    { "slot": "src.domain", "because": "src.ui dependsOn application only" },
    { "slot": "src.ports", "because": "src.ui dependsOn application only" },
    { "slot": "src.testHelpers", "because": "shared only with roles test, test-page, harness, dsl, driver" },
    { "role": "dom", "because": "edges/logic-not-on-the-dom" }
  ],
  "importableBy": [
    { "unit": "src/ui/graph", "kind": "any" },
    { "slot": "src.ui.component", "kind": "type" }
  ]
}
```

`fitness place component --in src/ui --name outline`:

```json
{
  "dir": "src/ui/outline",
  "unit": { "slot": "src.ui.component", "archetype": "component" },
  "files": ["outline.ts", "outline.dom.ts", "outline.test.ts", "outline.component.test.ts", "outline.dsl.ts", "outline.test-page.ts", "outline.harness.ts"],
  "surface": { "value": "outline.dom.ts", "type": "*.ts" },
  "mayImport": ["src/ui/<component> via surface", "src/ui/strings", "src/ui/icons", "src/application"]
}
```

`may` returns the verdict with every check it ran (`dependency-direction`, `unit-surface`, each `edges` rule), so an
agent sees why. Slot `description`s are what an agent reads to choose a slot for new code; the model doesn't guess
semantics.

## Weaver

The model is Weaver's vocabulary. Each operation is a codemod that reads the model to decide what to write, then
gates on `diff` so it never makes the metrics worse.

| Operation | Reads from the model |
| --- | --- |
| `add <slot> <name> --in <unit>` | target dir from `identify`, files from `scaffold` |
| `move <file> --to <unit>` | refuses or warns on edges the move would break (`verdict` on every edge, before writing) |
| `extract-unit <file> --group <n>` | a module-cohesion group becomes a new unit of a chosen slot; surface decides what stays exported |
| `introduce-port <edge>` | for a `dependency-direction` finding from an inner slot to an outer one: an interface in the `ports` slot from the names used, the outer module implements it |

## Prior art

| | Sheriff | eslint-plugin-boundaries | dependency-cruiser | archetypes |
| --- | --- | --- | --- | --- |
| Unit definition | path tree with `<placeholder>` tags | flat element list, glob + capture | regex per rule | tree of archetypes, recursive |
| Nesting | via path tree | parent/child/sibling relationships | no | `contains`, recursive |
| Surface | barrel `index.ts`, or `internal/` in barrel-less mode | entry-point rule | no | strategy per archetype, split by type/value |
| File categories | no | yes (`files`) | regex | roles, inherited |
| Type vs value edges | no | yes | yes | yes, on `dependsOn` and surface |
| Re-export chains | no | no | no | resolved to the declarer (existing facts) |
| Required imports | no | no | yes | `requires` |
| Cycles | no | no | files | files and units |
| Quality metrics | no | no | no | same tool |
| Query API | no | no | no | yes |

Borrowed: boundaries' unit vs file category, relationships and per-edge kind; Sheriff's placeholder syntax and its
barrel and internal-folder surfaces, as strategies rather than a convention. Neither fixed convention is required:
`index.ts` is one possible marker or surface, never assumed.

## Validation

Configs written against the code as of 2026-11-20. `presets` as proposed:

```ts
// fitness/presets
export const hexagon = (slots: Record<string, Partial<Slot>> = {}) =>
  archetype('hexagon', {
    loose: 'deny',
    contains: merge({
      domain: { dir: 'domain', dependsOn: [] },
      ports: { dir: 'ports', dependsOn: ['domain'] },
      application: { dir: 'application', dependsOn: ['domain', 'ports'] },
      adapters: { dir: 'adapters', dependsOn: ['domain', 'ports'] },
      ui: { dir: 'ui', dependsOn: ['application', 'domain'] },
    }, slots),            // per-slot shallow merge; `null` removes a slot
  });
```

### Working title

Replaces every rule in `.dependency-cruiser.mjs`, `no-circular` included (`no-cycle` with `types: true`, since depcruise
counts pre-compilation deps).

```ts
import { archetype, defineConfig, deny, requires } from 'fitness';
import { hexagon } from 'fitness/presets';

const testRoles = ['test', 'test-page', 'harness', 'dsl'];

const component = archetype('component', {
  identify: { marker: '{name}.dom.ts' },
  // A component reaches another only through render<Component>, plus types from its plain modules.
  surface: { value: '{name}.dom.ts', type: '*.ts' },
  scaffold: ['{name}.ts', '{name}.dom.ts', '{name}.test.ts', '{name}.component.test.ts', '{name}.dsl.ts', '{name}.test-page.ts', '{name}.harness.ts'],
  contains: () => ({ component: { use: component, dependsOn: ['component'], description: 'A component used only inside this one' } }),
});

const ui = archetype('ui', {
  contains: {
    component: { use: component, dependsOn: ['component', 'strings', 'icons', 'transition'] },
    strings: { dir: 'strings', description: "The app's words" },
    icons: { dir: 'icons' },
    transition: { files: 'transition.ts' },
  },
  edges: {
    'logic-not-on-the-dom': deny({ from: { roleNot: ['dom', 'test', 'harness'] }, to: { role: 'dom' } }),
  },
});

export default defineConfig({
  exclude: ['e2e/**', 'lint/**', 'scripts/**', '*.ts'],
  root: archetype('working-title', {
    roles: {
      test: { files: ['**/*.test.ts'], seesInternals: true },
      'test-page': { files: '**/*.test-page.ts', seesInternals: true },
      harness: { files: '**/*.harness.ts', seesInternals: true },
      dsl: { files: '**/*.dsl.ts', seesInternals: true },
      'driver-contract': 'src/test-helpers/driver.ts',
      driver: '**/*.driver.ts',
      dom: '**/*.dom.ts',
    },
    edges: {
      'dsl-not-on-a-driver': deny({ from: { role: 'dsl' }, to: { role: 'driver' } }),
      'scenario-code-in-test-helpers': deny({
        from: { roleNot: [...testRoles, 'driver'], notIn: 'src.testHelpers' },
        to: { role: ['dsl', 'driver', 'driver-contract', 'harness'] },
      }),
      'dsl-on-the-driver-contract': requires({ from: { role: 'dsl' }, to: { role: 'driver-contract' } }),
    },
    contains: {
      src: {
        dir: 'src',
        use: hexagon({
          ui: { dependsOn: ['application'], use: ui },
          methods: { dir: 'methods', dependsOn: ['domain'], description: 'Method definitions as data' },
          startup: { files: ['main.ts', 'app.ts', 'shell.ts'], dependsOn: '*' },
          testHelpers: { dir: 'test-helpers', dependsOn: '*', shared: { from: [...testRoles, 'driver'] } },
        }),
      },
    },
  }),
});
```

Fits:

- Layer direction, component-through-render (as a surface), logic-not-on-the-dom, dsl/driver rules and the required
  driver-contract import all map directly. `ui/icons` has no `icons.dom.ts`, so the marker correctly leaves it out
  of `component`.
- Nested components (`your-projects` holding `project-list`, `projects-folder`, `start-a-project`) come from the
  recursive slot. `graph` importing `project-list.dom.ts` fails the surface chain at `your-projects`, which
  depcruise's single-level regex doesn't catch.
- The ui-reaches-ports-through-application leak is a `dependency-direction` finding on each ui importer (edges resolve
  to the declarer) and a `no-cross-unit-reexport` finding on application.

Misfits:

- `ui` depends on application only, while the preset's `ui` also allows domain. Overriding is fine, but it means the
  preset is a starting point, not a guarantee.
- `testHelpers` as `shared: { from: testRoles }` is stricter than depcruise: app code can't import any test helper,
  not just drivers and harnesses. Probably right; check against the code.
- Root-level `src/*.css` and tool configs are outside TS analysis, so they aren't modelled.

### Weaver

Weaver is hexagonal in spirit but its layers aren't the preset's: ports at the bottom, an engine tier, operations, a
daemon that dispatches, plugin slices. It doesn't use `hexagon`.

```ts
const plugin = archetype('plugin', { description: 'One framework: detection, engine, helpers' });

export default defineConfig({
  exclude: ['src/__testHelpers__/fixtures/**', 'eval/**', 'scripts/**'],
  root: archetype('weaver', {
    roles: { test: { files: ['**/*.test.ts', '**/__testHelpers__/**'], seesInternals: true } },
    contains: {
      src: {
        dir: 'src',
        use: archetype('weaver-src', {
          loose: 'deny',
          contains: {
            ports: { dir: 'ports', dependsOn: [] },
            domain: { dir: 'domain', dependsOn: [{ slot: 'ports', kind: 'type' }] },
            utils: { dir: 'utils', dependsOn: ['domain', 'ports'] },
            tsEngine: { dir: 'ts-engine', dependsOn: ['domain', 'ports', 'utils', { slot: 'operations', files: 'types.ts' }] },
            operations: { dir: 'operations', dependsOn: ['domain', 'ports', 'utils', 'tsEngine'] },
            plugins: {
              dir: 'plugins',
              dependsOn: ['domain', 'ports', 'utils', 'tsEngine', { slot: 'operations', files: 'types.ts' }],
              use: archetype('plugins', { contains: { plugin: { dir: '{name}', use: plugin } } }),
            },
            daemon: { dir: 'daemon', dependsOn: ['domain', 'ports', 'utils', 'tsEngine', 'operations', 'plugins', { slot: 'adapters', files: 'schema.ts' }] },
            adapters: { dir: 'adapters', dependsOn: ['daemon', 'ports', 'utils'] },
            testHelpers: { dir: '__testHelpers__', dependsOn: '*', shared: { from: ['test'] } },
          },
        }),
      },
    },
  }),
});
```

Fits: the tiers and the plugin slices (peers isolated by default, so a Svelte plugin can't import the Vue one).
`unit-cycle` reports `tsEngine` ↔ `operations` and `daemon` ↔ `adapters` (value edges exist both ways), which is the
clearest statement of the two contract-file smells below.

Misfits, each a real design smell the model surfaces rather than a model gap:

- `operations/types.ts` is a contract the engines and plugins import, so `tsEngine` ↔ `operations` is mutual. Needs
  `{ slot, files }`. Moving the result types to a `contracts` slot (or domain) removes it.
- `adapters/schema.ts` is imported by the daemon, so `daemon` ↔ `adapters` is mutual. Same fix.
- `ports/` holds `NodeFileSystem` and `InMemoryFileSystem` beside the `FileSystem` interface, and `filesystem.ts`
  re-exports the Node one. To express "ports hold contracts", ports would need `contract` and `impl` file-group
  slots, and the re-export becomes a `no-cross-unit-reexport` finding. `utils/file-walk.ts` imports
  `NodeFileSystem` directly.
- `domain-purity.test.ts` (no `node:fs` in domain) moves into fitness once unit externals land.

### Fitness

```ts
const rule = archetype('rule', { surface: ['*.ts', '!*.test.ts'], scaffold: ['{camel id}.ts', '{camel id}.test.ts', 'README.md'] });

export default defineConfig({
  exclude: ['test/**', '**/*.test.ts'],
  root: archetype('fitness', {
    loose: 'deny',
    contains: {
      model: {
        dir: 'src/model',
        dependsOn: [],
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
      app: { dir: 'src/app', dependsOn: ['model'] },
      reporters: { dir: 'src/reporters', dependsOn: ['model'] },
      adapters: { dir: ['src/analysis', 'src/config', 'src/git'], dependsOn: ['app', 'model'] },
      entry: { files: ['src/cli.ts', 'src/builtins.ts'], dependsOn: ['adapters', 'reporters', 'app', 'model'] },
      api: { files: 'src/index.ts', dependsOn: ['model'], rules: { 'no-cross-unit-reexport': { allow: ['model'] } } },
      integrations: { dir: 'integrations', dependsOn: [] },
    },
  }),
});
```

Fits, and says more than today's kinds: model core can't import the rules nested inside it, rules can't import each
other (only `shared.ts`), and the three adapter folders are separate units that may not import each other (true
today, unenforced).

Misfits:

- The `{camel id}` scaffold needs a transform on captures. Either allow a small fixed set (`camel`, `pascal`) or drop
  it; Weaver can name files itself.
- "Every rule folder has a README.md" is a structural rule over non-TS files. Out of scope for now.
- `dir: [...]` producing one unit per folder, sharing a slot, is the right default here but should be spelled out in
  the README: a list is instances, not a union.

## Migration

- `kinds` is removed, not deprecated. Each kind becomes a slot under the root with `files: <its globs>`, the same
  `dependsOn`, and its `rules`. That's mechanical: `fitness migrate-config` prints it, then the project nests by hand.
- Overlap between kinds, silently resolved by order today, now shows as `ambiguous-unit`. Expect a few on first run.
- Peers: today "a kind may import itself" covers every file in the kind. Within a unit that still holds. Across two
  instances of one slot it now needs `dependsOn: [<own slot>]`. Flat migration produces one unit per kind, so
  nothing changes until a slot uses a placeholder.
- Finding keys for existing rules keep their shape (`rule:file->file`), so the first diff after migrating is quiet
  apart from renamed rules (`no-cross-kind-reexport` → `no-cross-unit-reexport`). The diff cache key already includes
  the tool digest, so no stale reuse.
- Rulesets: `kinds: { x: { rules } }` overlays become `units: { x: { rules } }`; migrate-config rewrites them too.

## Delivery

1. Model: archetype types, unit resolution, `unclassified` and `ambiguous-unit`, `fitness model`, migrate-config.
   Existing rules run on `unit` with a shim.
2. Rule contract: scopes, `ModelView`, phase, `--phase`. Port the built-in rules.
3. Structure: surfaces, roles, `edges`, `requires`, `unit-surface`, `no-cross-unit-reexport`, `unit-cycle`,
   `no-cycle`. Working title config lands here, report-only beside depcruise.
4. Queries: `where`, `may`, `place`. Try them from omp on working title before going further, so later work is
   shaped by a real consumer.
5. Facts: exports, then export-use (#6) and export-surface (#5).
6. Facts: calls, then #4a and #4b. Key anchors for anonymous callbacks land with this.

## Open questions

Decisions this doc proposes, which need a yes or a change:

1. **Child → parent's own files is never allowed.** The workaround is a `files` slot (fitness's `model.core`). The
   alternative is a `'^'` token in `dependsOn`. Proposed: no token until a case needs it.
2. **Peers are isolated by default.** Two instances of one slot need `dependsOn: [self]` to meet. Weaver plugins and
   fitness rules want isolation; working title components opt in.
3. **Structure intersects, options cascade nearest-wins.** The asymmetry is deliberate.
4. **Phase lives on the rule**, overridable by config and rulesets, rather than a shipped `edit` ruleset.
5. **External modules** are in scope (a unit's dependencies are part of the model, and Weaver has no oxlint). Shape
   proposed: `externals: { allow?: string[]; deny?: string[] }` on a slot, matched against bare specifiers, intersecting
   down the chain like other structure. Lands after delivery step 6; needs the analysis to keep unresolved external
   edges, which it drops today.
6. **Cross-cutting units** are `shared` slots, optionally restricted by role. None of the three projects has a truly
   global utility; working title's `strings` and weaver's `utils` both sit at one level with normal `dependsOn`. So
   `shared` is mainly for test helpers. Worth keeping it that narrow.
7. **Per-function rules.** Under the vision, `cognitive-complexity` and `function-cohesion` are generic quality, not
   unit measures. Options: drop them (oxlint/Biome have complexity rules), or keep them only as inputs to a unit
   measure (worst or summed complexity per unit). `module-cohesion` stays: a module is the smallest unit. Proposed:
   keep both running until unit measures exist, then decide with data from working title.
