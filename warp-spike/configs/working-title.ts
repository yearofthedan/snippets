// Working title, tuned until the only findings left are structure smells (see README). Each change from
// working-title.doc.ts is marked `// +`, so the diff shows what the doc's config was missing against real code.
import { defineConfig, w } from '../src/w.ts';

const testRunner = w.archetype('test-runner', {
  contains: {
    contract: w.files(['driver.ts', 'steps.ts', 'seed.ts', 'narrowing.ts']), // + seed, narrowing: dsl files use them
    rest: w.files('**'),
  },
  exposes: (s) => ({ contract: s.contract, runner: s.rest }),
  using: (s) => ({
    contract: [s.rest], // + the runner's two parts import each other
    rest: [s.contract], // +
  }),
});

const layer = w.archetype('layer', {
  requires: { testRunner, methods: w.dir() }, // + methods: tests of application and adapters use a method definition
  contains: {
    test: w.files('**/*.test.ts'),
    rest: w.files('**'),
  },
  exposes: (s) => ({ code: s.rest }),
  using: (s, { required }) => ({
    test: [s.rest, required.testRunner.runner, required.methods, w.pkg('vite-plus/*')], // + methods
  }),
});

const component = w.archetype('component', {
  identify: { marker: '{name}.dom.ts' },
  requires: {
    testRunner,
    application: layer, // + exact dir `using` no longer hands ui's grant to components
    ports: w.dir(), // +
    strings: w.dir(),
    icons: w.dir(),
    transition: w.files([]),
  },
  contains: {
    logic: w.files('*.ts'),
    dom: w.files('{name}.dom.ts'),
    harness: w.files('*.harness.ts'),
    testPage: w.files('*.test-page.ts'),
    dsl: w.files('*.dsl.ts'),
    test: w.files('*.test.ts'),
    subcomponent: w.dir('{name}', w.self),
  },
  exposes: (s) => ({ render: s.dom, testPage: s.testPage, dsl: s.dsl }),
  using: (s, { required }) => ({
    logic: [required.strings, required.application],
    dom: [s.logic, s.subcomponent.render, required.icons, required.strings, required.transition, required.application, required.ports],
    harness: [
      s.dom, s.logic, s.dsl, s.testPage, // + dsl, testPage
      required.testRunner.runner, required.testRunner.contract, required.application, required.ports, // + contract, application, ports
      w.pkg('vite-plus/*'), // +
    ],
    testPage: [s.harness, s.subcomponent.testPage, w.pkg('vite-plus/*')],
    dsl: [s.subcomponent.dsl, required.testRunner.contract],
    test: [
      s.logic, s.dom, s.harness, s.testPage, s.dsl, s.subcomponent.testPage,
      required.testRunner.runner, required.testRunner.contract, required.application, // + contract, application
      w.pkg('vite-plus/*'), w.pkg('@playwright/*'),
    ],
  }),
});

const ui = w.archetype('ui', {
  contains: {
    components: w.dir('{name}', component),
    strings: w.dir('strings'),
    icons: w.dir('icons'),
    transition: w.files('transition.ts'),
    test: w.files('*.test.ts'),
  },
  provides: (s) => ({ strings: s.strings, icons: s.icons, transition: s.transition }),
  exposes: (s) => ({
    render: s.components.render,
    testPage: s.components.testPage,
    dsl: s.components.dsl, // + e2e journeys drive the app through the top component's dsl
    strings: s.strings,
  }),
  using: (s) => ({
    test: [s.transition, w.pkg('vite-plus/*')],
  }),
});

const journeys = w.archetype('journeys', {
  requires: { testRunner, ui }, // + ui: journeys use its dsl
  contains: {
    dsl: w.files('*.dsl.ts'),
    rest: w.files('**'),
  },
  using: (s, { required }) => ({
    dsl: [required.testRunner.contract, required.ui.dsl], // + ui.dsl
    rest: [s.dsl, required.testRunner.runner, required.testRunner.contract, required.ui.dsl], // + contract, ui.dsl
  }),
});

const workingTitle = w.archetype('working-title', {
  loose: 'deny',
  contains: {
    domain: w.dir('src/domain', layer),
    ports: w.dir('src/ports'),
    application: w.dir('src/application', layer),
    adapters: w.dir('src/adapters', layer),
    methods: w.dir('src/methods'),
    ui: w.dir('src/ui', ui),
    styles: w.files('src/*.css'),
    shell: w.files('src/shell.ts'),
    app: w.files(['src/main.ts', 'src/app.ts']),
    testRunner: w.dir('src/test-helpers', testRunner),
    e2e: w.dir('e2e', journeys),
    lint: w.dir('lint', layer),
    tooling: w.files(['*.ts', 'scripts/**/*.ts']),
  },
  provides: (s) => ({
    testRunner: s.testRunner,
    application: s.application, // +
    ports: s.ports, // +
    methods: s.methods, // +
    ui: s.ui, // +
  }),
  using: (s) => ({
    ports: [s.domain],
    application: [s.domain, s.ports],
    adapters: [s.domain, s.ports, w.pkg('*')],
    methods: [s.domain],
    ui: [s.application],
    shell: [s.application, s.ui.strings],
    app: [s.application, s.adapters, s.ports, s.methods, s.ui.render, s.ui.strings, s.shell, s.styles, w.pkg('virtual:*')],
    testRunner: [
      s.domain, s.application, s.adapters, s.methods, s.app, s.shell, s.ui.render, s.ui.testPage,
      s.ports, // +
      w.pkg('*'),
    ],
    e2e: [s.adapters, s.ui.testPage, w.pkg('*')],
    lint: [w.pkg('*')],
    tooling: [s.lint, w.pkg('*')],
  }),
});

export default defineConfig({ root: workingTitle });
