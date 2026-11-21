// Working title in the chained shape: each part sees the parts declared above it, `using` stays on the part.
// Same model as working-title.ts (the tuned config); differences are marked `// chain:`.
import { c } from '../src/chain.ts';

export const testRunner = c.archetype('test-runner')
  // chain: contract and rest imported each other; declare-before-use can't express that, so the two files the
  // contract needs (scenario-file, ids) joined it
  .part('contract', c.files(['driver.ts', 'steps.ts', 'seed.ts', 'narrowing.ts', 'scenario-file.ts', 'ids.ts']))
  .part('rest', (s) => c.files('**', { using: [s.contract] }))
  .exposes((s) => ({ contract: s.contract, runner: s.rest }));

export const layer = c.archetype('layer')
  .requires({ testRunner, methods: c.dir() })
  .part('rest', c.files('**'))
  .part('test', (s, { required }) =>
    // chain: + contract, because ids.ts moved into it
    c.files('**/*.test.ts', { using: [s.rest, required.testRunner.runner, required.testRunner.contract, required.methods, c.pkg('vite-plus/*')] }))
  .exposes((s) => ({ code: s.rest }));

export const component = c.archetype('component')
  .identify({ marker: '{name}.dom.ts' })
  .surfaces('render', 'testPage', 'dsl') // chain: needed so parts can type s.subcomponent.render
  .requires({ testRunner, application: layer, ports: c.dir(), strings: c.dir(), icons: c.dir(), transition: c.files([]) })
  .part('subcomponent', (_, { self }) => c.dir('{name}', self))
  .part('logic', (_, { required }) => c.files('*.ts', { using: [required.strings, required.application] }))
  .part('dom', (s, { required }) =>
    c.files('{name}.dom.ts', {
      using: [s.logic, s.subcomponent.render, required.icons, required.strings, required.transition, required.application, required.ports],
    }))
  .part('dsl', (s, { required }) => c.files('*.dsl.ts', { using: [s.subcomponent.dsl, required.testRunner.contract] }))
  .part('testPage', (s) => c.files('*.test-page.ts', { using: [s.subcomponent.testPage, c.pkg('vite-plus/*')] })) // chain: dropped s.harness, no file uses it
  .part('harness', (s, { required }) =>
    c.files('*.harness.ts', {
      using: [s.dom, s.logic, s.dsl, s.testPage, required.testRunner.runner, required.testRunner.contract, required.application, required.ports, c.pkg('vite-plus/*')],
    }))
  .part('test', (s, { required }) =>
    c.files('*.test.ts', {
      using: [
        s.logic, s.dom, s.harness, s.testPage, s.dsl, s.subcomponent.testPage,
        required.testRunner.runner, required.testRunner.contract, required.application,
        c.pkg('vite-plus/*'), c.pkg('@playwright/*'),
      ],
    }))
  .exposes((s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }));

const ui = c.archetype('ui')
  .part('components', c.dir('{name}', component))
  .part('strings', c.dir('strings'))
  .part('icons', c.dir('icons'))
  .part('transition', c.files('transition.ts'))
  .part('test', (s) => c.files('*.test.ts', { using: [s.transition, c.pkg('vite-plus/*')] }))
  .provides((s) => ({ strings: s.strings, icons: s.icons, transition: s.transition }))
  .exposes((s) => ({ render: s.components.render, testPage: s.components.testPage, dsl: s.components.dsl, strings: s.strings }));

const journeys = c.archetype('journeys')
  .requires({ testRunner, ui })
  .part('dsl', (_, { required }) => c.files('*.dsl.ts', { using: [required.testRunner.contract, required.ui.dsl] }))
  .part('rest', (s, { required }) =>
    c.files('**', { using: [s.dsl, required.testRunner.runner, required.testRunner.contract, required.ui.dsl] }));

const workingTitle = c.archetype('working-title')
  .loose('deny')
  .part('domain', c.dir('src/domain', layer))
  .part('ports', (s) => c.dir('src/ports', undefined, { using: [s.domain] }))
  .part('methods', (s) => c.dir('src/methods', undefined, { using: [s.domain] }))
  .part('application', (s) => c.dir('src/application', layer, { using: [s.domain, s.ports] }))
  .part('adapters', (s) => c.dir('src/adapters', layer, { using: [s.domain, s.ports, c.pkg('*')] }))
  .part('ui', (s) => c.dir('src/ui', ui, { using: [s.application] }))
  .part('styles', c.files('src/*.css'))
  .part('shell', (s) => c.files('src/shell.ts', { using: [s.application, s.ui.strings] }))
  .part('app', (s) =>
    c.files(['src/main.ts', 'src/app.ts'], {
      using: [s.application, s.adapters, s.ports, s.methods, s.ui.render, s.ui.strings, s.shell, s.styles, c.pkg('virtual:*')],
    }))
  .part('testRunner', (s) =>
    c.dir('src/test-helpers', testRunner, {
      using: [s.domain, s.application, s.adapters, s.methods, s.app, s.shell, s.ui.render, s.ui.testPage, s.ports, c.pkg('*')],
    }))
  .part('e2e', (s) => c.dir('e2e', journeys, { using: [s.adapters, s.ui.testPage, c.pkg('*')] }))
  .part('lint', c.dir('lint', layer, { using: [c.pkg('*')] }))
  .part('tooling', (s) => c.files(['*.ts', 'scripts/**/*.ts'], { using: [s.lint, c.pkg('*')] }))
  .provides((s) => ({ testRunner: s.testRunner, application: s.application, ports: s.ports, methods: s.methods, ui: s.ui }));

export default { root: workingTitle };
