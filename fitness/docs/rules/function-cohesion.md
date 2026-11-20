# function-cohesion

Flag a long function whose statements fall into unrelated groups.

## Why

A long function that does one thing step by step is often fine. A long function that does two unrelated things is
two functions, and each change to one makes the reader wade through the other. Statements that share no data are the
seam, so this rule reports where it is.

## Rule details

The same LCOM4 measure as [`module-cohesion`](./module-cohesion.md), inside a function. The units are the body's
statements, linked when they share a parameter, a local or a `this.<member>`. Parameters count as shared, so guard
clauses stay attached to the code they guard. Statements that touch none of these are left out. A function is checked
only once it is over `maxLines`.

Incorrect code, over the tripwire:

```ts
export function handle(order: Order, log: (line: string) => void) {
  const placed = place(order);
  const id = placed.id;
  log(`placed ${id}`);
  const started = Date.now();
  const elapsed = Date.now() - started;
  console.log(elapsed);
}
```

Reported as two groups: lines 2-4 and 5-7.

Correct code: the timing moved to its own function, or a function whose statements all feed one another.

The finding's value is the number of groups. Its `details` lists their line ranges.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `maxLines` | `40` | The tripwire. Functions at or under it are not checked. |

## When not to use it

For code where a long sequence of independent steps is the point, such as test setup or a migration script. Turn it
off for that kind.
