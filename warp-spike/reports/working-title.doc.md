# Spike run: working-title

147 files, 481 edges (118 external). Analysis 1200 ms, model + verdicts 7 ms.

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
  src/test-helpers  [test-runner as testRunner]  rest:36 contract:2
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


## Findings (65 of 481 edges)

- `src/test-helpers/driver.ts` → `src/ui/project/graph/card/card.ts` (type): target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/test-helpers/playwright.driver.ts` → `src/ui/project/graph/card/card.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/test-helpers/seed.ts` → `src/ports/project-store.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/project/graph/graph.dsl.ts` → `src/test-helpers/narrowing.ts` (type): target is src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/ui/project/graph/graph.dsl.ts` → `src/test-helpers/seed.ts`: target is src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/ui/project/project.dsl.ts` → `src/test-helpers/seed.ts` (type): target is src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/ui/project/project.dsl.ts` → `src/ui/your-projects/your-projects.dsl.ts`: target is src/ui/your-projects [component via ui.components] part 'dsl'
- `e2e/journey.dsl.ts` → `src/test-helpers/seed.ts` (type): target is src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `e2e/journey.dsl.ts` → `src/ui/project/project.dsl.ts`: target is src/ui/project [component via ui.components] part 'dsl'
- `e2e/writer.ts` → `src/test-helpers/driver.ts` (type): target is src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `e2e/writer.ts` → `src/ui/project/project.dsl.ts`: target is src/ui/project [component via ui.components] part 'dsl'
- `e2e/scenarios.spec.ts` → `src/ui/project/project.dsl.ts` (type): target is src/ui/project [component via ui.components] part 'dsl'
- `src/ui/project/graph/card/card.dom.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/graph/graph.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/graph/graph.ts` → `src/ui/project/graph/card/card.ts` (type): target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/ui/project/graph/graph.dom.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/panel/panel.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/panel/panel.dom.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/project.dom.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/project.dom.ts` → `src/shell.ts` (type): target is . [working-title] part 'shell'
- `src/ui/your-projects/projects-folder/projects-folder.dom.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.dom.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/your-projects/project-list/project-list.dom.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/your-projects/your-projects.dom.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/test-helpers/folders.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/adapters/file-system-folders.component.test.ts` → `src/methods/snowflake-extended.ts`: target is src/methods [plain via working-title.methods] part '*'
- `src/adapters/local-storage-project-store.test.ts` → `src/methods/snowflake-extended.ts`: target is src/methods [plain via working-title.methods] part '*'
- `src/application/project.test.ts` → `src/methods/snowflake-extended.ts`: target is src/methods [plain via working-title.methods] part '*'
- `src/ui/project/graph/graph.test-page.ts` → `src/ui/project/graph/card/card.ts` (type): target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/test-helpers/box.ts` → `src/ui/project/graph/card/card.test-page.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'testPage'
- `src/test-helpers/box.ts` → `src/ui/project/graph/graph.test-page.ts`: target is src/ui/project/graph [component via component.subcomponent] part 'testPage'
- `src/test-helpers/graph-page.ts` → `src/ui/project/graph/card/card.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/test-helpers/graph-page.ts` → `src/ui/project/graph/card/card.test-page.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'testPage'
- `src/test-helpers/graph-page.ts` → `src/ui/project/graph/graph.test-page.ts`: target is src/ui/project/graph [component via component.subcomponent] part 'testPage'
- `src/test-helpers/the-app.ts` → `src/ports/project-store.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/project/project.harness.ts` → `src/test-helpers/driver.ts` (type): target is src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/ui/project/project.harness.ts` → `src/shell.ts` (type): target is . [working-title] part 'shell'
- `src/ui/project/project.harness.ts` → `src/ui/project/project.dsl.ts`: target is src/ui/project [component via ui.components] part 'dsl'
- `src/ui/project/project.harness.ts` → `src/ui/your-projects/your-projects.test-page.ts`: target is src/ui/your-projects [component via ui.components] part 'testPage'
- `src/ui/project/project.harness.ts` → `src/ui/project/project.test-page.ts`: target is src/ui/project [component via ui.components] part 'testPage'
- `src/ui/project/project.harness.ts` → `vite-plus/test` (pkg): no w.pkg in reach matches 'vite-plus/test'
- `src/ui/project/project.component.test.ts` → `src/test-helpers/driver.ts`: target is src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/ui/project/project.component.test.ts` → `src/ui/project/graph/card/card.test-page.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'testPage'
- `src/ui/project/project.component.test.ts` → `src/ui/your-projects/your-projects.test-page.ts`: target is src/ui/your-projects [component via ui.components] part 'testPage'
- `src/ui/project/project.component.test.ts` → `src/shell.ts`: target is . [working-title] part 'shell'
- `src/ui/project/graph/graph.harness.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/graph/graph.harness.ts` → `src/test-helpers/driver.ts` (type): target is src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/ui/project/graph/graph.harness.ts` → `src/ui/project/graph/graph.dsl.ts`: target is src/ui/project/graph [component via component.subcomponent] part 'dsl'
- `src/ui/project/graph/graph.harness.ts` → `src/ui/project/graph/graph.test-page.ts`: target is src/ui/project/graph [component via component.subcomponent] part 'testPage'
- `src/ui/project/graph/graph.harness.ts` → `vite-plus/test/browser` (pkg): no w.pkg in reach matches 'vite-plus/test/browser'
- `src/ui/project/graph/graph.component.test.ts` → `src/test-helpers/driver.ts`: target is src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/ui/project/graph/graph.test.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/graph/graph.test.ts` → `src/ui/project/graph/card/card.ts`: target is src/ui/project/graph/card [component via component.subcomponent] part 'logic'
- `src/ui/project/graph/layout.test.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/graph/card/card.harness.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/graph/card/card.dsl.ts` → `src/test-helpers/narrowing.ts` (type): target is src/test-helpers [test-runner via working-title.testRunner] part 'rest'
- `src/ui/project/graph/card/card.component.test.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/panel/panel.harness.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/panel/panel.component.test.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/project/panel/panel.component.test.ts` → `src/test-helpers/driver.ts`: target is src/test-helpers [test-runner via working-title.testRunner] part 'contract'
- `src/ui/project/panel/panel.test.ts` → `src/application/project.ts` (type): target is src/application [layer via working-title.application] part 'rest'
- `src/ui/your-projects/your-projects.harness.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/your-projects/project-list/project-list.harness.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/your-projects/project-list/start-a-project/start-a-project.harness.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'
- `src/ui/your-projects/projects-folder/projects-folder.harness.ts` → `src/ports/projects-folder.ts` (type): target is src/ports [plain via working-title.ports] part '*'

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

