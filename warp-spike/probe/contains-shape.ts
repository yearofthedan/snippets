// Dan's variant: the parts chain nested inside .contains(). Same component as configs/working-title.chain.ts.
// Run: node probe/contains-shape.ts  → checks it builds the same data as the flat chain.
import { c } from '../src/chain.ts';
import { component as flat, layer, testRunner } from '../configs/working-title.chain.ts';

export const component = c.archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .surfaces('render', 'testPage', 'dsl')
  .requires({ testRunner, application: layer, ports: c.dir(), strings: c.dir(), icons: c.dir(), transition: c.files([]) })
  .contains(({ required, self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('logic', c.files('*.ts', { using: [required.strings, required.application] }))
    .part('dom', (s) => c.files('{name}.dom.ts', {
      using: [s.logic, s.subcomponent.render, required.icons, required.strings, required.transition, required.application, required.ports],
    }))
    .part('dsl', (s) => c.files('*.dsl.ts', { using: [s.subcomponent.dsl, required.testRunner.contract] }))
    .part('testPage', (s) => c.files('*.test-page.ts', { using: [s.subcomponent.testPage, c.pkg('vite-plus/*')] }))
    .part('harness', (s) => c.files('*.harness.ts', {
      using: [s.dom, s.logic, s.dsl, s.testPage, required.testRunner.runner, required.testRunner.contract, required.application, required.ports, c.pkg('vite-plus/*')],
    }))
    .part('test', (s) => c.files('*.test.ts', {
      using: [
        s.logic, s.dom, s.harness, s.testPage, s.dsl, s.subcomponent.testPage,
        required.testRunner.runner, required.testRunner.contract, required.application,
        c.pkg('vite-plus/*'), c.pkg('@playwright/*'),
      ],
    })))
  .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }));

if (import.meta.main) {
  const same = JSON.stringify(component.data) === JSON.stringify(flat.data);
  console.log(same ? 'nested .contains() builds the same data as the flat chain' : 'DIFFERENT');
}
