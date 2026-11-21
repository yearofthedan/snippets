// Completion positions for probe/completions.ts, marked with /*|*/.
import { w } from '../src/w.ts';

const testRunner = w.archetype('test-runner', {
  contains: { contract: w.files(['driver.ts']), rest: w.files('**') },
  exposes: (s) => ({ contract: s.contract, runner: s.rest }),
});
export const component = w.archetype('component', {
  requires: { testRunner, strings: w.dir() },
  contains: { logic: w.files('*.ts'), dom: w.files('{name}.dom.ts'), subcomponent: w.dir('{name}', w.self) },
  exposes: (s) => ({ render: s.dom, testPage: s.logic }),
  using: (s, { required }) => ({
    dom: [s./*|*/logic, s.subcomponent./*|*/render, required./*|*/strings, required.testRunner./*|*/runner],
  }),
});
