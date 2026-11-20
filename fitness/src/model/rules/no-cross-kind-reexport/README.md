# no-cross-kind-reexport

Disallow re-exporting what another kind declares.

## Why

A module that re-exports another kind's names turns itself into a door to that kind. Importers then reach the other
kind without importing it, so the dependency is hidden from anyone reading their imports. `dependency-direction`
catches each importer that is not allowed through, but only once there is one, and once per importer. This rule
reports the one module where the leak starts, as soon as it is written.

## Rule details

A re-export is `export { x } from`, `export * from`, `export * as ns from`, or an imported name exported again with
`export { x }` or `export default x`. Type-only re-exports count: an interface is the API a kind is choosing to expose.
Re-exports within one kind, such as barrels, are fine.

With this config:

```json
{
  "kinds": {
    "domain": { "match": "src/domain/**" },
    "app": { "match": "src/app/**", "dependsOn": ["domain"] },
    "ui": { "match": "src/ui/**", "dependsOn": ["app"] }
  }
}
```

Incorrect code:

```ts
// src/app/project.ts
export { type ProjectsFolder } from '../domain/ports.ts';
```

```ts
// src/app/project.ts
import { ProjectsFolder } from '../domain/ports.ts';

export { ProjectsFolder };
```

```ts
// src/app/index.ts
export * from '../domain/order.ts';
```

Correct code:

```ts
// src/app/index.ts: a barrel over its own kind
export { openProject } from './project.ts';
```

```ts
// src/app/project.ts: uses the port without passing it on, and exposes an app-level API instead
import type { ProjectsFolder } from '../domain/ports.ts';

export const openProject = (folder: ProjectsFolder, name: string) => folder.open(name);
```

There is one finding per pair of modules. Its value is the number of names re-exported (1 for `export *`), so passing
on more counts as worse. The finding's `details` lists the names and the edges.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `allow` | `[]` | Kinds this kind may re-export from. A kind name or a list of them. |

Set it on the kind that re-exports, so it reads as a kind pair:

```json
{
  "kinds": {
    "entry": {
      "match": "src/main.ts",
      "dependsOn": ["app", "adapter"],
      "rules": { "no-cross-kind-reexport": { "allow": ["app", "adapter"] } }
    }
  }
}
```

## When not to use it

When a kind exists to present others as one API, such as a composition root or a package's public entry point. Allow
the kinds it presents rather than turning the rule off, so a new kind leaking through it is still reported.
