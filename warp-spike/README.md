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
node probe/chain-errors.ts                        # load-time error for a misspelt self surface
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

## 4. Chained builder (current shape)

`src/chain.ts`, `configs/working-title.chain.ts`. Parts are declared in order inside `.contains()`. `using` stays on
the part, and its callback sees only the parts above it.

```ts
export const component = c.archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ testRunner, application: layer, ports: c.dir(), strings: c.dir(), icons: c.dir(), transition: c.files([]) })
  .contains(({ required, self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('logic', c.files('*.ts', { using: [required.strings, required.application] }))
    .part('dom', c.files('{name}.dom.ts', { using: (s) => [s.logic, s.subcomponent.render, required.icons, ...] }))
    ...)
  .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }));
```

Working title gives the same 17 findings in an 84-line config.

**`using: (s) => [...]` on the part, as Dan suggested, works.** `s` gets its type from what `.part()` expects,
passed through `c.files` / `c.dir` (TypeScript infers the inner call's type parameters from its expected return
type). One catch: `.part()` must have a single signature that takes a union of files and dir parts. With a
files/dir overload pair, the first overload fails on a dir part, and TypeScript keeps `s` as `unknown` when it tries
the second. The same happens if the part's type is a generic parameter. `using` can also be a plain array when it
names no sibling parts.

**Self references are loose in the types and checked at load.** `s.subcomponent.<anything>` compiles, so there is
no `.surfaces()` and no names up front. When `.exposes()` runs, every self surface a part named must exist:

```
component.dom uses subcomponent.rendr; component exposes render, testPage
```

Every other reference stays strict.

- **Completions** (`node probe/completions.ts probe/completion-target.chain.ts`): `s.` lists only the parts above;
  `required.` and child surfaces (`s.components.`) list their names. Self surfaces list nothing useful (Ref's own
  keys), as expected for any-name.
- **Type errors** (`probe/chain-errors.ts`) land on the reference: misspelt part, a part declared further down
  ("does not exist", which doesn't say "declared below"), an undeclared requirement, misspelt requirement and child
  surfaces ("Did you mean"), and a duplicate part (`'"dom"' is not assignable to '"part 'dom' is already
  declared"'`).
- **Declare-before-use** rules out cycles between sibling parts. The runner's contract and rest imported each other,
  so `scenario-file.ts` and `ids.ts` moved into the contract, and layer tests now also list the contract. Whether
  sibling-part cycles should be legal is an open model question. Parts go in dependency order (`subcomponent`
  before `dom`, layers before `ui` and `app`).
- **TypeScript 7.1 has nothing for circular inference.** The
  [7.1 beta notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/) list no inference
  changes; types still flow forward only.

Tried and dropped: parts declared then `using` as a separate map (section 1), `.surfaces('render', ...)` up front,
and lazy `s.subcomponent('render')` calls checked at `.exposes`. The last one worked, but it gave no completions,
reported a typo at `.exposes` instead of at the reference, and spelt self references differently from all others.

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
