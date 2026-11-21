// Self references without .surfaces(). Run `node probe/lazy-self.ts` for the runtime check, `pnpm probe` for errors.
import { c } from '../src/chain.ts';
import { component as flat, layer, testRunner } from '../configs/working-title.chain.ts';

// Option 1, lazy: s.subcomponent('render') keeps 'render' as a literal type; .exposes() at the end must define
// every name collected that way. No names up front, any order.
export const lazy = c.archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ testRunner, application: layer, ports: c.dir(), strings: c.dir(), icons: c.dir(), transition: c.files([]) })
  .contains(({ required, self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('logic', c.files('*.ts', { using: [required.strings, required.application] }))
    .part('dom', (s) => c.files('{name}.dom.ts', {
      using: [s.logic, s.subcomponent('render'), required.icons, required.strings, required.transition, required.application, required.ports],
    }))
    .part('dsl', (s) => c.files('*.dsl.ts', { using: [s.subcomponent('dsl'), required.testRunner.contract] }))
    .part('testPage', (s) => c.files('*.test-page.ts', { using: [s.subcomponent('testPage'), c.pkg('vite-plus/*')] }))
    .part('harness', (s) => c.files('*.harness.ts', {
      using: [s.dom, s.logic, s.dsl, s.testPage, required.testRunner.runner, required.testRunner.contract, required.application, required.ports, c.pkg('vite-plus/*')],
    }))
    .part('test', (s) => c.files('*.test.ts', {
      using: [
        s.logic, s.dom, s.harness, s.testPage, s.dsl, s.subcomponent('testPage'),
        required.testRunner.runner, required.testRunner.contract, required.application,
        c.pkg('vite-plus/*'), c.pkg('@playwright/*'),
      ],
    })))
  .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }));

// L1: a typo in a lazy name. The error lands on .exposes, not on the typo.
c.archetype('typo')
  .contains(({ self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('dom', (s) => c.files('*.dom.ts', { using: [s.subcomponent('rendr')] })))
  .exposes((s) => ({ render: s.dom }));

// L2: the parent side is unchanged: a finished archetype's surfaces are typed properties.
c.archetype('ui').part('components', c.dir('{name}', lazy)).exposes((s) => ({ render: s.components.render, oops: s.components.rendr }));

// Option 2: names with exposes up front, binding at the end. Same typing as .surfaces().
c.archetype('component2')
  .exposes('render')
  .part('subcomponent', (_, { self }) => c.dir('{name}', self))
  .part('dom', (s) => c.files('*.dom.ts', { using: [s.subcomponent.render] }))
  .exposes((s) => ({ render: s.dom }));

if (import.meta.main) {
  console.log(JSON.stringify(lazy.data) === JSON.stringify(flat.data) ? 'lazy builds the same data as the flat chain' : 'DIFFERENT');
}
