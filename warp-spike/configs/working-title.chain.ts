// Working title in the chained shape: parts in order inside .contains(), `using` on the part, and a part's `using`
// sees only the parts above it. Same model as working-title.ts (the tuned config); differences are marked `// chain:`.
import { c } from '../src/chain.ts';

export const testRunner = c.archetype('test-runner')
  .contains(() => c.parts()
    // chain: contract and rest imported each other; declare-before-use can't express that, so the two files the
    // contract needs (scenario-file, ids) joined it
    .part('contract', c.files(['driver.ts', 'steps.ts', 'seed.ts', 'narrowing.ts', 'scenario-file.ts', 'ids.ts']))
    .part('rest', c.files('**', { using: (s) => [s.contract] })))
  .exposes((s) => ({ contract: s.contract, runner: s.rest }));

export const layer = c.archetype('layer')
  .requires({ testRunner, methods: c.dir() })
  .contains(({ required }) => c.parts()
    .part('rest', c.files('**'))
    // chain: + contract, because ids.ts moved into it
    .part('test', c.files('**/*.test.ts', {
      using: (s) => [s.rest, required.testRunner.runner, required.testRunner.contract, required.methods, c.pkg('vite-plus/*')],
    })))
  .exposes((s) => ({ code: s.rest }));

export const component = c.archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .requires({ testRunner, application: layer, ports: c.dir(), strings: c.dir(), icons: c.dir(), transition: c.files([]) })
  .contains(({ required, self }) => c.parts()
    .part('subcomponent', c.dir('{name}', self))
    .part('logic', c.files('*.ts', { using: [required.strings, required.application] }))
    .part('dom', c.files('{name}.dom.ts', {
      using: (s) => [s.logic, s.subcomponent.render, required.icons, required.strings, required.transition, required.application, required.ports],
    }))
    .part('dsl', c.files('*.dsl.ts', { using: (s) => [s.subcomponent.dsl, required.testRunner.contract] }))
    .part('testPage', c.files('*.test-page.ts', { using: (s) => [s.subcomponent.testPage, c.pkg('vite-plus/*')] })) // chain: no s.harness, no file uses it
    .part('harness', c.files('*.harness.ts', {
      using: (s) => [s.dom, s.logic, s.dsl, s.testPage, required.testRunner.runner, required.testRunner.contract, required.application, required.ports, c.pkg('vite-plus/*')],
    }))
    .part('test', c.files('*.test.ts', {
      using: (s) => [
        s.logic, s.dom, s.harness, s.testPage, s.dsl, s.subcomponent.testPage,
        required.testRunner.runner, required.testRunner.contract, required.application,
        c.pkg('vite-plus/*'), c.pkg('@playwright/*'),
      ],
    })))
  .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }));

export const ui = c.archetype('ui')
  .contains(() => c.parts()
    .part('components', c.dir('{name}', component))
    .part('strings', c.dir('strings'))
    .part('icons', c.dir('icons'))
    .part('transition', c.files('transition.ts'))
    .part('test', c.files('*.test.ts', { using: (s) => [s.transition, c.pkg('vite-plus/*')] })))
  .provides((s) => ({ strings: s.strings, icons: s.icons, transition: s.transition }))
  .exposes((s) => ({ render: s.components.render, testPage: s.components.testPage, dsl: s.components.dsl, strings: s.strings }));

const journeys = c.archetype('journeys')
  .requires({ testRunner, ui })
  .contains(({ required }) => c.parts()
    .part('dsl', c.files('*.dsl.ts', { using: [required.testRunner.contract, required.ui.dsl] }))
    .part('rest', c.files('**', { using: (s) => [s.dsl, required.testRunner.runner, required.testRunner.contract, required.ui.dsl] })));

const workingTitle = c.archetype('working-title')
  .loose('deny')
  .contains(() => c.parts()
    .part('domain', c.dir('src/domain', layer))
    .part('ports', c.dir('src/ports', undefined, { using: (s) => [s.domain] }))
    .part('methods', c.dir('src/methods', undefined, { using: (s) => [s.domain] }))
    .part('application', c.dir('src/application', layer, { using: (s) => [s.domain, s.ports] }))
    .part('adapters', c.dir('src/adapters', layer, { using: (s) => [s.domain, s.ports, c.pkg('*')] }))
    .part('ui', c.dir('src/ui', ui, { using: (s) => [s.application] }))
    .part('styles', c.files('src/*.css'))
    .part('shell', c.files('src/shell.ts', { using: (s) => [s.application, s.ui.strings] }))
    .part('app', c.files(['src/main.ts', 'src/app.ts'], {
      using: (s) => [s.application, s.adapters, s.ports, s.methods, s.ui.render, s.ui.strings, s.shell, s.styles, c.pkg('virtual:*')],
    }))
    .part('testRunner', c.dir('src/test-helpers', testRunner, {
      using: (s) => [s.domain, s.application, s.adapters, s.methods, s.app, s.shell, s.ui.render, s.ui.testPage, s.ports, c.pkg('*')],
    }))
    .part('e2e', c.dir('e2e', journeys, { using: (s) => [s.adapters, s.ui.testPage, c.pkg('*')] }))
    .part('lint', c.dir('lint', layer, { using: [c.pkg('*')] }))
    .part('tooling', c.files(['*.ts', 'scripts/**/*.ts'], { using: (s) => [s.lint, c.pkg('*')] })))
  .provides((s) => ({ testRunner: s.testRunner, application: s.application, ports: s.ports, methods: s.methods, ui: s.ui }));

export default { root: workingTitle };
