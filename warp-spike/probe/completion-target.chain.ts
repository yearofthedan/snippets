// Completion positions for `node probe/completions.ts probe/completion-target.chain.ts`, marked with /*|*/.
import { c } from '../src/chain.ts';

const testRunner = c.archetype('test-runner')
  .part('contract', c.files('driver.ts'))
  .part('rest', c.files('**'))
  .exposes((s) => ({ contract: s.contract, runner: s.rest }));

export const component = c.archetype('component')
  .surfaces('render', 'testPage')
  .requires({ testRunner, strings: c.dir() })
  .part('subcomponent', (_, { self }) => c.dir('{name}', self))
  .part('logic', c.files('*.ts'))
  .part('dom', (s, { required }) => c.files('{name}.dom.ts', {
    using: [s./*|*/logic, s.subcomponent./*|*/render, required./*|*/strings, required.testRunner./*|*/runner],
  }))
  .part('test', (s) => c.files('*.test.ts', { using: [s./*|*/dom] }))
  .exposes((s) => ({ render: s.dom, testPage: s.logic }));

c.archetype('ui').part('components', c.dir('{name}', component)).exposes((s) => ({ render: s.components./*|*/render }));
