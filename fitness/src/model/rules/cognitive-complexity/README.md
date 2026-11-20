# cognitive-complexity

Limit how hard a function is to follow.

## Why

Every branch, loop and break in flow is something a reader has to hold in their head, and nesting multiplies it.
Past a point, changes to the function get made without understanding all of it, which is where bugs come from.
Cognitive complexity counts that cost, unlike cyclomatic complexity, which counts paths and treats a flat `switch`
the same as nested `if`s.

## Rule details

SonarSource's cognitive complexity for each outermost function, with nested functions counted into it:

- `if`, ternaries, `switch`, loops and `catch` add 1 plus their nesting depth.
- `else`, `else if`, labelled jumps, each run of mixed `&&`/`||`/`??`, and direct recursion (a call that resolves to
  the function itself, `this.method()` included) add 1.

Incorrect code, with `max: 4`:

```ts
export function grade(score: number, strict: boolean) {
  if (score > 90) {                  // +1
    for (const n of [1, 2]) {        // +2 (nesting 1)
      if (strict && n > 1) return 'A+'; // +3 (nesting 2), +1 for &&
    }
    return 'A';
  } else if (score > 50 || strict) { // +1, +1 for ||
    return 'B';
  } else {                           // +1
    return 'C';
  }
}
```

Correct code: return early, pull the loop into its own function, or replace the branches with a lookup.

The finding's value is the total, and the message names the largest increments with their lines.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `max` | `15` | The highest total a function may have. |

## When not to use it

For generated code, or parsers and state machines whose shape follows a grammar. Raise `max` for that kind rather
than turning the rule off.
