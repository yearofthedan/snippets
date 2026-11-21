// Completion positions for `node probe/completions.ts probe/completion-target.chain.ts`, marked with /*|*/.
import { c } from '../src/chain.ts';

const testRunner = c.archetype('test-runner')
  .contains(() => c.parts()
    .part('contract', c.files('driver.ts'))
    .part('rest', c.files('**')))
  .exposes((s) => ({ contract: s.contract, runner: s.rest }));

export const component = c.archetype('component')
  .requires({ testRunner, strings: c.dir() })
  .contains(({ required, self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('logic', c.files('*.ts'))
    .part('dom', c.files('{name}.dom.ts', {
      using: (s) => [s./*|*/logic, s.subcomponent./*|*/render, required./*|*/strings, required.testRunner./*|*/runner],
    }))
    .part('test', c.files('*.test.ts', { using: (s) => [s./*|*/dom] })))
  .exposes((s) => ({ render: s.dom, testPage: s.logic }));

c.archetype('ui')
  .part('components', c.dir('{name}', component))
  .part('app', c.files('app.ts', { using: (s) => [s.components./*|*/render] }));
