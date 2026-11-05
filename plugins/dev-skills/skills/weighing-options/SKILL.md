---
name: weighing-options
description: Use whenever you put two or more options to the user, or recommend one way of doing something over another — a design, an interface, a test's shape, where code lives, whether to file or fix.
---

# Weighing options

A recommendation is decided before it is written down: the reason given is whichever came to mind first, and that is usually what the option costs to build. These steps run in order, so the options are compared on what each leaves behind before one is picked.

## The steps

1. **State the goal** in the user's words: what they or the people using the work get, and what must stay the same. Where they have not said, say that you are assuming it.
2. **List the options before choosing one.** The list holds:
   - the user's own sketch, when they gave one, in the vocabulary they used;
   - each variant of a platform or library feature that behaves differently, such as `dialog.show()` and `dialog.showModal()`, rather than the feature as one option;
   - one option found by asking what already knows the fact the change needs — a test's own assertion, the data a library returns, the caller that owns the output — before inventing a way to ask for it.
3. **Fill the same rows for every option**, in a table:

   | Row | What goes in it |
   | --- | --- |
   | What they get | What the user, or the people using the work, can do or see |
   | How it reads | The code, the block or the screen as it would be, shown rather than described |
   | What can go wrong | The failure it allows, and in which state |
   | What the tests must cover | The cases it needs, and the wrong implementation each one catches |
   | Cost to build | Measured, not guessed. Not a reason for or against the option |

   A row you have not checked says so. A fact about the present — that something already shipped, that the code around it does it this way — goes in no row: it describes the state, and says nothing about what an option leaves behind.
4. **Rule an option out only on a reason that applies to every variant of it.** A reason true of one variant rules out that variant.
5. **Put the worst row of the option you prefer first**, before its strengths.
6. **Recommend by citing a row other than cost.** A recommendation that can cite none is not one: put the options to the user without a pick.

## When the user asks why

"Is that because it's less complex or because it's better?" is answered by the row the recommendation cites. If that row is cost, the recommendation was cost, and says so.
