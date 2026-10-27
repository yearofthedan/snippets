---
name: designing
description: Use when drafting, prototyping or proposing what the user sees — a layout, an interaction, motion, copy on screen — in a story draft, an approach, or a scratch build the builder will play with.
---

# Designing what the user sees

A look is cheapest to fix in a prototype the builder plays with. Make the first one show what the user will meet, so play finds taste, not gaps.

## What the project supplies

- **Design principles**, if the project keeps them. Default: the product doc's design principles section.
- **Standards** on markup, motion and styles. Default: `docs/standards/`.
- **A glossary** of the terms the interface uses, if the project keeps one.

## Before building

1. **Start from the builder's design.** Ask whether a mockup or prototype exists, and look for recent design files beside the repository. Build from it where one exists.
2. **Name what the user gains, and what stays constant.** Say it before choosing a mechanism: "room for more text on the focus" picks a different mechanism from "zoom", and "one fixed zoom level" a different one from "fit the content".
3. **Read what governs the look**, in its own words and for how binding it says it is: the design principles, the standards, and the glossary entry for each term the interaction touches. A working idea is not a ruling, and an option it doesn't rule out stays open.
4. **Cost each option from its smallest version**, and a lost behaviour, such as heading depth, from the platform's own means of keeping it, such as `aria-level`.

## Showing it

Show the states the user reaches, not the resting case alone:

- each kind of piece in the position being designed, at the length it really holds;
- long text: sentences that wrap, many children;
- the interaction states: a field being typed in, the moment after something is added;
- each change in layout, and how it shows: something appearing, moving, scrolling;
- a signal in both cases: with something to signal, and without. If the two look the same, it signals nothing.

Where something covers a control, click the control and see that it still works before calling the overlap a look issue.

Judge each state as the user sees it, on a fresh full-page load of the build handed over. A claim about how the build behaves is made after doing that thing in it.
