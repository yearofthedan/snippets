# Warp config spike

Throwaway. Tests the riskiest parts of `fitness/docs/design/archetypes.md` (PR 33) against real code: typed
builders, part resolution and edge verdicts on working title (`main` at `9c69b9a`; the doc used `cb16dd5`, one
commit earlier, no structural change). Model as agreed on 2026-11-21: `using` is the only permission, a dir part's
`using` covers only the matched unit's own files, packages are `w.pkg(...)` inside `using`, tests are a part in
every archetype.

```sh
pnpm install && (cd ../fitness && pnpm install)
pnpm typecheck                                    # builders + both configs
pnpm probe                                        # fails on purpose: prints the error messages
node probe/completions.ts [target]                # asks TS 7.1's language server for completions
node probe/contains-shape.ts                      # nested .contains() builds the same data as the flat chain
node src/main.ts ../../working-title configs/working-title.ts --where > reports/working-title.md
```

Only dependency is `typescript` 7.1. Internal edges reuse fitness's analyzer (resolved through barrels); packages and
CSS come from a crude specifier scan.

## 1. Typed builders

**The doc's shape can't be typed.** One callback that returns `contains` and also receives `s` is circular:
TypeScript fixes the part names before it sees the return, so `s.domian` compiles and every reference is
`Ref<string>` (`probe/doc-shape.ts`). No signature fixes this; it's how inference works.

**What works: parts as data first, callbacks after.**

```ts
const component = w.archetype('component', {
  requires: { testRunner, strings: w.dir() },
  contains: { logic: w.files('*.ts'), dom: w.files('{name}.dom.ts'), subcomponent: w.dir('{name}', w.self) },
  exposes: (s) => ({ render: s.dom }),
  using: (s, { required }) => ({
    logic: [required.strings],
    dom: [s.logic, s.subcomponent.render, required.strings, w.pkg('lit')],
  }),
});
```

TypeScript infers `contains` first, then types the later callbacks from it (intra-expression inference). Checked:

- Completions from the language server: `s.` → `logic, dom, subcomponent`; `s.subcomponent.` → `render, testPage`;
  `required.` → `testRunner, strings`; `required.testRunner.` → `contract, runner`. One leak: `kind` shows up
  beside the surfaces.
- Recursion through `w.self` types `s.subcomponent.render` from the archetype's own `exposes`.
- Errors (`probe/errors.ts`) are short and point at the reference: `Property 'rendr' does not exist on type
  'SurfaceRefs<{ render: Ref }>'. Did you mean 'render'?`. Same for misspelt parts, requirement surfaces, a
  requirement that isn't declared, and a surface on a files part.
- A `using` key that isn't a part (`lgoic: []`) needed a type trick, and its error is a 5-line wall anchored on
  `using:`, not on the key.
- Type cost is nothing: 16k instantiations, 40 ms check for both configs.

**Sharp edges:**

- **Key order matters.** `exposes` must come before `using`. Swap them and `s.subcomponent.render` fails with
  `'render' does not exist on 'SurfaceRefs<{}>'`, and so does every parent that references the archetype's
  surfaces, far from the cause (`probe/order.ts`). `provides` and `exposes` can't use self surfaces for the same
  reason. A chained builder (`.contains().exposes().using()`) would force the order, at the cost of the data look.
- **`using` moves away from the part.** Each part is now declared twice: its pattern in `contains`, its permissions
  in `using`. Reading what `dom` may do means reading two places.
- What types can't check, and the spike checks at run time: a requirement with no provider, a requirement no part
  uses. Not done: a provider whose archetype doesn't match.

## 2. Part resolution

All 147 files (program + imported CSS) land in exactly one unit and part. **0 ties, 0 unclaimed.** The tree matches
the doc: `project` → `graph` → `card`, `panel`; `your-projects` → `project-list` → `start-a-project`,
`projects-folder`; `icons` and `strings` are plain units, not components. Full listing in `reports/working-title.md`.

Surprises:

- First run claimed 42 component files as loose because the dir path `'{name}'` was filled with the parent's
  `{name}`. A dir path must always capture afresh; the doc's "templates see only the unit's own captures" is easy to
  get wrong in both directions.
- `logic: '*.ts'` is a silent catch-all: `layout.ts` is `graph`'s logic, which is right, but nothing says so.
- The runner's own tests (`driver.test.ts` and others) sit in `rest`, which is exposed as `runner`, so components
  may import the runner's tests. Tests inside a provided archetype leak through its surface unless the archetype
  adds a `test` part.

## 3. Edge verdicts

**The doc's table: 13 of 13 match**, including the hypothetical edges (`reports/working-title.md`, end).

**The doc's config as written** (`configs/working-title.doc.ts`) gives **65 findings on 481 edges.** The doc
expected only its three known groups. **Tuned** (`configs/working-title.ts`, each change marked `// +`): **17
findings**, which are:

| Group | Findings | Status |
| --- | --- | --- |
| test-helpers → `card`, `graph` internals (`driver`, `playwright.driver`, `graph-page`, `box`) | 7 | known (doc) |
| `graph` → `card.ts` (`graph.ts`, `graph.test.ts`, `graph.test-page.ts`) | 3 | known (doc) |
| `project` → `src/shell.ts` (dom, harness, component test) | 3 | known (doc) |
| `project` → sibling `your-projects` (`dsl`, `harness` and component test reach its dsl/test page) | 3 | **new** |
| `project.component.test.ts` → grandchild `card.test-page.ts` | 1 | **new** |

The new ones are real structure smells of the same kind as the known ones: `project`'s tests drive
`your-projects`, and reach past `graph` to `card`.

What the 48 extra findings in the doc's config were, i.e. what it took to fit real code:

- **Exact dir `using` (22).** Every component imports `application` types and some import `ports`; under exact,
  `ui: { using: [s.application] }` no longer reaches them. Fix: root `provides` both, `component` `requires`
  both, and four parts list them. Three edits in two archetypes per shared thing, as predicted.
- **The runner's contract/runner split (11).** Harnesses and tests import `driver.ts` (contract) as well as the
  runner; dsl files import `seed.ts` and `narrowing.ts`, which aren't drivers. Every runner consumer ends up listing
  both surfaces, and the contract grew to four files. The surface split buys one rule (dsl off the drivers) and costs
  a second entry everywhere else.
- **The runner's two parts import each other.** The doc's `test-runner` gave neither part `using`.
- **Missing grants the doc couldn't know (15):** harness → own `dsl` and `testPage` (and testPage → harness, a
  cycle inside a component); harness needs `vite-plus`; test-helpers → `ports`; layer tests → `methods`; e2e
  journeys need `ui` to expose `dsl`.

## 4. Chained builder (round two)

Dan didn't like section 1's shape, since `using` moves off the part. Round two tries a chain where each part sees
the parts declared before it: `src/chain.ts`, `configs/working-title.chain.ts`.

```ts
export const component = c.archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .surfaces('render', 'testPage', 'dsl')
  .requires({ testRunner, application: layer, ports: c.dir(), strings: c.dir(), icons: c.dir(), transition: c.files([]) })
  .part('subcomponent', (_, { self }) => c.dir('{name}', self))
  .part('logic', (_, { required }) => c.files('*.ts', { using: [required.strings, required.application] }))
  .part('dom', (s, { required }) => c.files('{name}.dom.ts', { using: [s.logic, s.subcomponent.render, required.icons, ...] }))
  ...
  .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }));
```

Dan's nested variant, `.contains(({ required, self }) => c.parts().part(...).part(...))`, types the same way and
builds identical data (`probe/contains-shape.ts`). The two differ only in how they read.

**Results.** Working title gives the same 17 findings as the tuned config, and the config is 84 lines against 142.
No inference tricks are involved: each `.part()` call's types are already fixed when its callback runs.

- **Completions** (`node probe/completions.ts probe/completion-target.chain.ts`): `s.` lists only the parts declared
  so far. The rest match round one, including the `kind` leak.
- **Errors** (`probe/chain-errors.ts`): all 8 mistakes are caught at the reference: misspelt part, a part declared
  further down, an undeclared requirement, misspelt surfaces, and `exposes` missing a declared surface. A duplicate
  part reads `Argument of type '"dom"' is not assignable to parameter of type '"part 'dom' is already declared"'`.
  The ugly `using`-key error from round one is gone, because there's no separate map. One weak message: a part
  used before it's declared just says it "does not exist".

**`self` needs surface names up front.** Types only flow forward, so parts can't see an `exposes` that comes after
them. A recursive archetype declares `.surfaces('render', 'testPage', 'dsl')` first. `self` carries those names, so
`s.subcomponent.render` types, and `exposes` is checked to define exactly those surfaces. Leaving out `.surfaces()`
gives `'render' does not exist on type 'SurfaceRefs<{}>'`, which doesn't name the cause. Only recursive archetypes
need it. A parent reads a child archetype's surfaces from the finished chain, as before.

**`requires` and `provides`.** `.requires()` goes before the parts, and every part callback gets `{ required }`.
`.provides()` and `.exposes()` go at the end. This order is natural, not a trap: calling `requires` late is a type
error in the earlier parts.

**Declare-before-use.**
- **Parts that need each other.** The runner's contract (`driver`, `steps`, `seed`, `narrowing`) imports
  `scenario-file.ts` and `ids.ts` from `rest`, and `rest` imports the contract. A chain can't express that cycle,
  so those two files moved into the contract. That ripples: layer tests import `ids.ts`, so layer tests now list
  `required.testRunner.contract` as well. Whether this is a cost or a feature depends on whether a cycle between
  sibling parts should be legal. The model never said.
- **testPage and harness.** The doc gave `testPage` access to the harness, but no test page imports one. Only
  harness imports test page, so the chain order works: testPage, then harness.
- **Test parts that need everything** go last, which reads naturally. The `using` lists stay long, at 11 and 9
  entries, so a shorthand for the whole unit is still worth it.
- **Order no longer matches reading order.** `subcomponent` has to come before `dom`, and the root has to declare
  `domain`, `ports`, `methods` and `application` before `ui`, `shell` and `app`. That's dependency order, which is
  arguably the architecture. But it means you can't group parts by theme, for example tests last.

**How it reads against the doc shape.** Each line is one part, its pattern and what it uses, which is what the doc
wanted. Callbacks are the noise: `(s, { required }) =>` appears on most lines, and `(_, { self })` is awkward. The
nested `.contains()` variant puts `required` and `self` in one scope, so most parts take only `(s) =>`. It reads
closer to the doc, with one extra level of nesting. If the flat form is kept, passing `required` through `s`
(`s.$required.strings`) would remove the second argument.

**Not tried:** the names-first variant (`.parts('logic', ...).define(...)`). Chaining didn't hit a wall, and
names-first repeats every part name.

## What hurt to write (round one)

1. **Plumbing for shared things.** `application` and `ports` for components, `methods` for layer tests, `ui` for
   journeys: each is `provides` at the root + `requires` in the archetype + an entry per part. The tuned config
   added 4 provides, 4 requires and about 20 `using` entries for that.
2. **Long `using` lists on test parts.** `component.test` has 11 entries, `harness` 9. Most are "everything in my
   unit plus the runner". A `s.$unit`-style shorthand would cut most of them.
3. **Two places per part** (pattern in `contains`, permissions in `using`) and **key order** (above). Both come from
   the inference fix, not the model.
4. **Surfaces on a provided archetype are hard to get right.** `required.testRunner.runner` vs `.contract` was the
   most common fix. Splitting a provider's surface multiplies entries for every consumer.
5. **Errors at run time are fine, at type level mostly fine.** "target is `src/ui/project/graph/card`
   [component via component.subcomponent] part 'logic'" told me what to change every time. The only bad message is
   the unknown `using` key.

The model itself held: the verdicts were right every time, and every finding left is a real smell.
