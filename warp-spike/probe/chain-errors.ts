// Probe: mistakes in the chained shape. `pnpm probe` shows the type errors; `node probe/chain-errors.ts` shows the
// load-time check for self surfaces, which the types leave open on purpose.
import { c } from '../src/chain.ts';

const testRunner = c.archetype('test-runner')
  .contains(() => c.parts()
    .part('contract', c.files('driver.ts'))
    .part('rest', c.files('**', { using: (s) => [s.contract] })))
  .exposes((s) => ({ contract: s.contract, runner: s.rest }));

const typed = () => c.archetype('component')
  .requires({ testRunner })
  .contains(({ required, self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('logic', c.files('*.ts', { using: (s) => [
      s.domian,                     // C1 misspelt part
      s.dom,                        // C2 part declared further down
      required.strings,             // C3 not required
      required.testRunner.contrat,  // C4 misspelt requirement surface
    ] }))
    .part('dom', c.files('{name}.dom.ts', { using: (s) => [s.logic] }))
    .part('dom', c.files('*.dom.ts')))                                // C5 duplicate part
  .exposes((s) => ({ render: s.dom, oops: s.subcomponent.anything })); // self surfaces: any name types

const kids = c.archetype('kids')
  .part('components', c.dir('{name}', testRunner))
  .part('app', c.files('app.ts', { using: (s) => [s.components.runnr] })); // C6 misspelt child surface

// Not a type error: a misspelt self surface types, and fails when the config loads.
const loadTime = () => c.archetype('component')
  .contains(({ self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('logic', c.files('*.ts'))
    .part('dom', c.files('{name}.dom.ts', { using: (s) => [s.logic, s.subcomponent.rendr] })))
  .exposes((s) => ({ render: s.dom, testPage: s.logic }));

if (import.meta.main) {
  try { loadTime(); } catch (error) { console.log(`load error: ${(error as Error).message}`); }
  void typed; void kids;
}
