# dependency-direction

Disallow imports from a kind the importing kind does not depend on.

## Why

Layers only protect anything if dependencies point one way. Once the domain imports an adapter, changing the
database means changing the domain, tests need the database, and the layers stop being separable. The direction is
cheap to keep and expensive to recover, so it is checked on every import.

## Rule details

A module may import from its own kind and the kinds its kind's `dependsOn` lists. Named imports are followed through
barrels and re-exports to the module that declares them, so going through an allowed barrel does not hide the
dependency: the finding names the declaring module and the barrel as the route. Type-only imports count too.

With this config:

```json
{
  "kinds": {
    "domain": { "match": "src/domain/**", "dependsOn": [] },
    "adapter": { "match": "src/adapters/**", "dependsOn": ["domain"] }
  }
}
```

Incorrect code:

```ts
// src/domain/order.ts
import { saveOrder } from '../adapters/index.ts'; // reported against src/adapters/db/orderRepo.ts
import type { OrderRow } from '../adapters/db/orderRepo.ts';
```

Correct code:

```ts
// src/domain/order.ts: the domain owns the port
export interface OrderStore {
  save(order: Order): void;
}
```

```ts
// src/adapters/db/orderRepo.ts: the adapter implements it
import type { OrderStore } from '../../domain/order.ts';

export const orderRepo: OrderStore = { save: (order) => { /* ... */ } };
```

There is one finding per pair of modules. Its value is the number of names imported, so importing more across the
same boundary counts as worse. When the target kind may depend on the importer's kind, the message advises a port.
Otherwise it advises moving the code, or adding the kind to `dependsOn` if the dependency is intended.

## Options

None. The kind's `dependsOn` sets what it allows.

## When not to use it

For a kind with no direction to keep, such as tests or scripts. Give it a `dependsOn` that lists every kind it may
reach, or turn the rule off for that kind.

See also [`no-cross-kind-reexport`](./no-cross-kind-reexport.md), which reports the module that re-exports another
kind, where this rule reports each importer.
