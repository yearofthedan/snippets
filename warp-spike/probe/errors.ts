// Probe 3: what a wrong reference looks like with the spike's builders. Run `pnpm probe` to see the messages.
import { w } from '../src/w.ts';

const testRunner = w.archetype('test-runner', {
  contains: { contract: w.files(['driver.ts', 'steps.ts']), rest: w.files('**') },
  exposes: (s) => ({ contract: s.contract, runner: s.rest }),
});
const component = w.archetype('component', {
  requires: { testRunner, strings: w.dir() },
  contains: { logic: w.files('*.ts'), dom: w.files('{name}.dom.ts'), subcomponent: w.dir('{name}', w.self) },
  exposes: (s) => ({ render: s.dom }),
  using: (s, { required }) => ({ dom: [s.logic, s.subcomponent.render, required.strings] }),
});

w.archetype('bad', {
  requires: { testRunner },
  contains: { logic: w.files('*.ts'), kids: w.dir('{name}', component) },
  exposes: (s) => ({ code: s.lgic }),             // E1 misspelt part in exposes
  using: (s, { required }) => ({
    logic: [
      s.domian,                                    // E2 misspelt part
      s.kids.rendr,                                // E3 misspelt child surface
      required.testRunner.contrat,                 // E4 misspelt requirement surface
      required.strings,                            // E5 not required here
      s.logic.render,                              // E6 surface on a files part
    ],
    lgoic: [],                                     // E7 using for a part that doesn't exist
  }),
});
