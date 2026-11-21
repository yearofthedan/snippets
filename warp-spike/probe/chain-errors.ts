// Probe: mistakes in the chained shape. Run `pnpm probe` to see the messages. Each line is tagged.
import { c } from '../src/chain.ts';

const testRunner = c.archetype('test-runner')
  .part('contract', c.files('driver.ts'))
  .part('rest', (s) => c.files('**', { using: [s.contract] }))
  .exposes((s) => ({ contract: s.contract, runner: s.rest }));

c.archetype('component')
  .surfaces('render', 'dsl')
  .requires({ testRunner })
  .part('subcomponent', (_, { self }) => c.dir('{name}', self))
  .part('logic', (s, { required }) => c.files('*.ts', { using: [
    s.domian,                     // C1 misspelt part
    s.dom,                        // C2 part declared further down
    required.strings,             // C3 not required
    required.testRunner.contrat,  // C4 misspelt requirement surface
  ] }))
  .part('dom', (s) => c.files('{name}.dom.ts', { using: [s.logic, s.subcomponent.rendr] })) // C5 misspelt self surface
  .part('dom', c.files('*.dom.ts'))                                                          // C6 duplicate part
  .exposes((s) => ({ render: s.dom }));                                                      // C7 'dsl' declared, not exposed

c.archetype('no-surfaces')
  .part('subcomponent', (_, { self }) => c.dir('{name}', self))
  .part('dom', (s) => c.files('*.ts', { using: [s.subcomponent.render] }))                  // C8 recursion without .surfaces()
  .exposes((s) => ({ render: s.dom }));
