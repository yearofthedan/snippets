# Spike run: working-title

147 files, 481 edges (118 external). Analysis 1144 ms, model + verdicts 13 ms.

## Units

```
.  [working-title]  tooling:7 app:2 shell:1
  e2e  [journeys as e2e]  rest:9 dsl:2
  lint  [layer as lint]  test:6 rest:9
  src/adapters  [layer as adapters]  test:3 rest:3
  src/application  [layer as application]  test:1 rest:1
  src/domain  [layer as domain]  test:1 rest:1
  src/methods  [plain as methods]  *:1
  src/ports  [plain as ports]  *:2
  src/test-helpers  [test-runner as testRunner]  rest:34 contract:4
  src/ui  [ui as ui]  test:1 transition:1
    src/ui/icons  [plain as icons]  *:3
    src/ui/project  [component as components]  test:2 dom:1 dsl:1 harness:1 testPage:1
      src/ui/project/graph  [component as subcomponent]  test:4 dom:1 dsl:1 harness:1 testPage:1 logic:2
        src/ui/project/graph/card  [component as subcomponent]  test:2 dom:1 dsl:1 harness:1 testPage:1 logic:1
      src/ui/project/panel  [component as subcomponent]  test:2 dom:1 dsl:1 harness:1 testPage:1 logic:1
    src/ui/strings  [plain as strings]  *:2
    src/ui/your-projects  [component as components]  test:1 dom:1 dsl:1 harness:1 testPage:1
      src/ui/your-projects/project-list  [component as subcomponent]  test:1 dom:1 dsl:1 harness:1 testPage:1
        src/ui/your-projects/project-list/start-a-project  [component as subcomponent]  test:1 dom:1 dsl:1 harness:1 testPage:1 logic:1
      src/ui/your-projects/projects-folder  [component as subcomponent]  test:2 dom:1 dsl:1 harness:1 testPage:1 logic:1
```

## Config errors (0)


## Ties (0)


## Unclaimed (loose) files (0)


## Findings (17 of 481 edges)

- `src/test-helpers/driver.ts` → `src/ui/project/graph/card/card.ts` (type): target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/test-helpers/playwright.driver.ts` → `src/ui/project/graph/card/card.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/ui/project/project.dsl.ts` → `src/ui/your-projects/your-projects.dsl.ts`: target is src/ui/your-projects [component via ui.components] part 'dsl'
- `src/ui/project/graph/graph.ts` → `src/ui/project/graph/card/card.ts` (type): target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/ui/project/project.dom.ts` → `src/shell.ts` (type): target is . [working-title] part 'shell'
- `src/ui/project/graph/graph.test-page.ts` → `src/ui/project/graph/card/card.ts` (type): target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/test-helpers/box.ts` → `src/ui/project/graph/card/card.test-page.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'testPage'
- `src/test-helpers/box.ts` → `src/ui/project/graph/graph.test-page.ts`: target is src/ui/project/graph [component via component.subcomponent] part 'testPage'
- `src/test-helpers/graph-page.ts` → `src/ui/project/graph/card/card.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/test-helpers/graph-page.ts` → `src/ui/project/graph/card/card.test-page.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'testPage'
- `src/test-helpers/graph-page.ts` → `src/ui/project/graph/graph.test-page.ts`: target is src/ui/project/graph [component via component.subcomponent] part 'testPage'
- `src/ui/project/project.harness.ts` → `src/shell.ts` (type): target is . [working-title] part 'shell'
- `src/ui/project/project.harness.ts` → `src/ui/your-projects/your-projects.test-page.ts`: target is src/ui/your-projects [component via ui.components] part 'testPage'
- `src/ui/project/project.component.test.ts` → `src/ui/project/graph/card/card.test-page.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'testPage'
- `src/ui/project/project.component.test.ts` → `src/ui/your-projects/your-projects.test-page.ts`: target is src/ui/your-projects [component via ui.components] part 'testPage'
- `src/ui/project/project.component.test.ts` → `src/shell.ts`: target is . [working-title] part 'shell'
- `src/ui/project/graph/graph.test.ts` → `src/ui/project/graph/card/card.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'

## Doc edge table

| Edge | Doc | Spike | In code | Why |
| --- | --- | --- | --- | --- |
| `project/project.dom.ts` → `project/graph/graph.dom.ts` | ✅ | ✅ | yes | in reach |
| `project/project.dom.ts` → `project/graph/card/card.dom.ts` | ❌ | ❌ | no | target is src/ui/project/graph/card [component via component.subcomponent] part 'dom' |
| `project/graph/graph.dom.ts` → `project/panel/panel.dom.ts` | ❌ | ❌ | no | target is src/ui/project/panel [component via component.subcomponent] part 'dom' |
| `project/graph/card/card.dom.ts` → `icons/open-beside.dom.ts` | ✅ | ✅ | yes | in reach |
| `project/graph/card/card.ts` → `icons/open-beside.dom.ts` | ❌ | ❌ | no | target is src/ui/icons [plain via ui.icons] part '*' |
| `project/graph/card/card.ts` → `project/graph/card/card.dom.ts` | ❌ | ❌ | no | target is src/ui/project/graph/card [component via component.subcomponent] part 'dom' |
| `project/graph/card/card.dsl.ts` → `src/test-helpers/playwright.driver.ts` | ❌ | ❌ | no | target is src/test-helpers [test-runner via working-title.testRunner] part 'rest' |
| `project/graph/graph.component.test.ts` → `project/graph/card/card.test-page.ts` | ✅ | ✅ | yes | in reach |
| `src/app.ts` → `project/project.dom.ts` | ✅ | ✅ | yes | in reach |
| `src/app.ts` → `project/graph/card/card.dom.ts` | ❌ | ❌ | no | target is src/ui/project/graph/card [component via component.subcomponent] part 'dom' |
| `project/graph/graph.ts` → `project/graph/card/card.ts` | ❌ | ❌ | yes | target is src/ui/project/graph/card [component via component.subcomponent] part 'logic' |
| `project/project.dom.ts` → `src/shell.ts` | ❌ | ❌ | yes | target is . [working-title] part 'shell' |
| `src/domain/project.ts` → `src/test-helpers/staging.ts` | ❌ | ❌ | no | target is src/test-helpers [test-runner via working-title.testRunner] part 'rest' |

## Where every file landed

- `do.test.ts`: . [working-title] part 'tooling'
- `e2e/contrast.spec.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/journey.dsl.ts`: e2e [journeys via working-title.e2e] part 'dsl'
- `e2e/manifest.spec.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/motion.spec.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/new-version.dsl.ts`: e2e [journeys via working-title.e2e] part 'dsl'
- `e2e/new-version.spec.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/offline.spec.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/private-build.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/scenarios.spec.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/the-keys-on-the-current-card.spec.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `e2e/writer.ts`: e2e [journeys via working-title.e2e] part 'rest'
- `lint/component-stays-in-its-root.test.ts`: lint [layer via working-title.lint] part 'test'
- `lint/component-stays-in-its-root.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/dom-in-dom-files.test.ts`: lint [layer via working-title.lint] part 'test'
- `lint/dom-in-dom-files.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/find-elements.test.ts`: lint [layer via working-title.lint] part 'test'
- `lint/find-elements.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/index.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/override.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/sample-lint.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/test-through-owner.test.ts`: lint [layer via working-title.lint] part 'test'
- `lint/test-through-owner.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/wait-on-the-page.test.ts`: lint [layer via working-title.lint] part 'test'
- `lint/wait-on-the-page.ts`: lint [layer via working-title.lint] part 'rest'
- `lint/words-from-the-strings.test.ts`: lint [layer via working-title.lint] part 'test'
- `lint/words-from-the-strings.ts`: lint [layer via working-title.lint] part 'rest'
- `playwright.config.ts`: . [working-title] part 'tooling'
- `pnpm-workspace.test.ts`: . [working-title] part 'tooling'
- `scripts/_lint-comments.test.ts`: . [working-title] part 'tooling'
- `src/adapters/file-system-folders.component.test.ts`: src/adapters [layer via working-title.adapters] part 'test'
- `src/adapters/file-system-folders.ts`: src/adapters [layer via working-title.adapters] part 'rest'
- `src/adapters/folder-name.test.ts`: src/adapters [layer via working-title.adapters] part 'test'
- `src/adapters/folder-name.ts`: src/adapters [layer via working-title.adapters] part 'rest'
- `src/adapters/local-storage-project-store.test.ts`: src/adapters [layer via working-title.adapters] part 'test'
- `src/adapters/local-storage-project-store.ts`: src/adapters [layer via working-title.adapters] part 'rest'
- `src/app.ts`: . [working-title] part 'app'
- `src/application/project.test.ts`: src/application [layer via working-title.application] part 'test'
- `src/application/project.ts`: src/application [layer via working-title.application] part 'rest'
- `src/domain/project.test.ts`: src/domain [layer via working-title.domain] part 'test'
- `src/domain/project.ts`: src/domain [layer via working-title.domain] part 'rest'
- `src/main.ts`: . [working-title] part 'app'
- `src/methods/snowflake-extended.ts`: src/methods [plain via working-title.methods] part '*'
- `src/ports/project-store.ts`: src/ports [plain via working-title.ports] part '*'
- `src/ports/projects-folder.ts`: src/ports [plain via working-title.ports] part '*'
- `src/shell.ts`: . [working-title] part 'shell'
- `src/test-helpers/box.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/driver.component.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/driver.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/driver.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/test-helpers/every-file.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/every-file.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/field.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/folder.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/folder.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/folders.component.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/folders.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/frames.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/frames.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/graph-page.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/ids.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/locators.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/look.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/matchers.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/matchers.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/narrowing.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/narrowing.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/test-helpers/play.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/play.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/playwright.driver.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/raw-glob.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/recording.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/scenario-entry.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/scenario-file.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/scenario-file.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/scenario-files.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/seed.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/seed.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/test-helpers/staging.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/steps.test.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/steps.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/test-helpers/the-app.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/toy-method.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/test-helpers/vitest-browser.driver.ts`: src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/ui/icons/error.dom.ts`: src/ui/icons [plain via ui.icons] part '*'
- `src/ui/icons/open-beside.dom.ts`: src/ui/icons [plain via ui.icons] part '*'
- `src/ui/icons/svg.dom.ts`: src/ui/icons [plain via ui.icons] part '*'
- `src/ui/project/graph/card/card.component.test.ts`: src/ui/project/graph/card [component via component.subcomponent] part 'test'
- `src/ui/project/graph/card/card.dom.ts`: src/ui/project/graph/card [component via component.subcomponent] part 'dom'
- `src/ui/project/graph/card/card.dsl.ts`: src/ui/project/graph/card [component via component.subcomponent] part 'dsl'
- `src/ui/project/graph/card/card.harness.ts`: src/ui/project/graph/card [component via component.subcomponent] part 'harness'
- `src/ui/project/graph/card/card.test-page.ts`: src/ui/project/graph/card [component via component.subcomponent] part 'testPage'
- `src/ui/project/graph/card/card.test.ts`: src/ui/project/graph/card [component via component.subcomponent] part 'test'
- `src/ui/project/graph/card/card.ts`: src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/ui/project/graph/graph.component.test.ts`: src/ui/project/graph [component via component.subcomponent] part 'test'
- `src/ui/project/graph/graph.dom.ts`: src/ui/project/graph [component via component.subcomponent] part 'dom'
- `src/ui/project/graph/graph.dsl.test.ts`: src/ui/project/graph [component via component.subcomponent] part 'test'
- `src/ui/project/graph/graph.dsl.ts`: src/ui/project/graph [component via component.subcomponent] part 'dsl'
- `src/ui/project/graph/graph.harness.ts`: src/ui/project/graph [component via component.subcomponent] part 'harness'
- `src/ui/project/graph/graph.test-page.ts`: src/ui/project/graph [component via component.subcomponent] part 'testPage'
- `src/ui/project/graph/graph.test.ts`: src/ui/project/graph [component via component.subcomponent] part 'test'
- `src/ui/project/graph/graph.ts`: src/ui/project/graph [component via component.subcomponent] part 'logic'
- `src/ui/project/graph/layout.test.ts`: src/ui/project/graph [component via component.subcomponent] part 'test'
- `src/ui/project/graph/layout.ts`: src/ui/project/graph [component via component.subcomponent] part 'logic'
- `src/ui/project/panel/panel.component.test.ts`: src/ui/project/panel [component via component.subcomponent] part 'test'
- `src/ui/project/panel/panel.dom.ts`: src/ui/project/panel [component via component.subcomponent] part 'dom'
- `src/ui/project/panel/panel.dsl.ts`: src/ui/project/panel [component via component.subcomponent] part 'dsl'
- `src/ui/project/panel/panel.harness.ts`: src/ui/project/panel [component via component.subcomponent] part 'harness'
- `src/ui/project/panel/panel.test-page.ts`: src/ui/project/panel [component via component.subcomponent] part 'testPage'
- `src/ui/project/panel/panel.test.ts`: src/ui/project/panel [component via component.subcomponent] part 'test'
- `src/ui/project/panel/panel.ts`: src/ui/project/panel [component via component.subcomponent] part 'logic'
- `src/ui/project/project.component.test.ts`: src/ui/project [component via ui.components] part 'test'
- `src/ui/project/project.dom.ts`: src/ui/project [component via ui.components] part 'dom'
- `src/ui/project/project.dsl.test.ts`: src/ui/project [component via ui.components] part 'test'
- `src/ui/project/project.dsl.ts`: src/ui/project [component via ui.components] part 'dsl'
- `src/ui/project/project.harness.ts`: src/ui/project [component via ui.components] part 'harness'
- `src/ui/project/project.test-page.ts`: src/ui/project [component via ui.components] part 'testPage'
- `src/ui/strings/en.ts`: src/ui/strings [plain via ui.strings] part '*'
- `src/ui/strings/strings.ts`: src/ui/strings [plain via ui.strings] part '*'
- `src/ui/transition.test.ts`: src/ui [ui via working-title.ui] part 'test'
- `src/ui/transition.ts`: src/ui [ui via working-title.ui] part 'transition'
- `src/ui/your-projects/project-list/project-list.component.test.ts`: src/ui/your-projects/project-list [component via component.subcomponent] part 'test'
- `src/ui/your-projects/project-list/project-list.dom.ts`: src/ui/your-projects/project-list [component via component.subcomponent] part 'dom'
- `src/ui/your-projects/project-list/project-list.dsl.ts`: src/ui/your-projects/project-list [component via component.subcomponent] part 'dsl'
- `src/ui/your-projects/project-list/project-list.harness.ts`: src/ui/your-projects/project-list [component via component.subcomponent] part 'harness'
- `src/ui/your-projects/project-list/project-list.test-page.ts`: src/ui/your-projects/project-list [component via component.subcomponent] part 'testPage'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.component.test.ts`: src/ui/your-projects/project-list/start-a-project [component via component.subcomponent] part 'test'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.dom.ts`: src/ui/your-projects/project-list/start-a-project [component via component.subcomponent] part 'dom'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.dsl.ts`: src/ui/your-projects/project-list/start-a-project [component via component.subcomponent] part 'dsl'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.harness.ts`: src/ui/your-projects/project-list/start-a-project [component via component.subcomponent] part 'harness'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.test-page.ts`: src/ui/your-projects/project-list/start-a-project [component via component.subcomponent] part 'testPage'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.ts`: src/ui/your-projects/project-list/start-a-project [component via component.subcomponent] part 'logic'
- `src/ui/your-projects/projects-folder/projects-folder.component.test.ts`: src/ui/your-projects/projects-folder [component via component.subcomponent] part 'test'
- `src/ui/your-projects/projects-folder/projects-folder.dom.ts`: src/ui/your-projects/projects-folder [component via component.subcomponent] part 'dom'
- `src/ui/your-projects/projects-folder/projects-folder.dsl.ts`: src/ui/your-projects/projects-folder [component via component.subcomponent] part 'dsl'
- `src/ui/your-projects/projects-folder/projects-folder.harness.ts`: src/ui/your-projects/projects-folder [component via component.subcomponent] part 'harness'
- `src/ui/your-projects/projects-folder/projects-folder.test-page.ts`: src/ui/your-projects/projects-folder [component via component.subcomponent] part 'testPage'
- `src/ui/your-projects/projects-folder/projects-folder.test.ts`: src/ui/your-projects/projects-folder [component via component.subcomponent] part 'test'
- `src/ui/your-projects/projects-folder/projects-folder.ts`: src/ui/your-projects/projects-folder [component via component.subcomponent] part 'logic'
- `src/ui/your-projects/your-projects.component.test.ts`: src/ui/your-projects [component via ui.components] part 'test'
- `src/ui/your-projects/your-projects.dom.ts`: src/ui/your-projects [component via ui.components] part 'dom'
- `src/ui/your-projects/your-projects.dsl.ts`: src/ui/your-projects [component via ui.components] part 'dsl'
- `src/ui/your-projects/your-projects.harness.ts`: src/ui/your-projects [component via ui.components] part 'harness'
- `src/ui/your-projects/your-projects.test-page.ts`: src/ui/your-projects [component via ui.components] part 'testPage'
- `stryker.vitest.config.ts`: . [working-title] part 'tooling'
- `vite.config.test.ts`: . [working-title] part 'tooling'
- `vite.config.ts`: . [working-title] part 'tooling'
