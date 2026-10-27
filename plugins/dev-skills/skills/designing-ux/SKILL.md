---
name: designing-ux
description: Use when drafting, prototyping or proposing what the user sees and does — a layout, an interaction, motion, focus, copy on screen — in a story draft, an approach, or a scratch build the builder will play with.
---

# Designing the user's experience

A look is cheapest to fix in a prototype the builder plays with. Make the first one show what the user will meet, so play finds taste, not gaps. The experience is more than how a screen sits still: it is what happens when the user acts, waits, makes a mistake, or uses only the keyboard.

## What the project supplies

- **Design principles**, if the project keeps them. Default: the product doc's design principles section.
- **Standards** on markup, motion and styles. Default: `docs/standards/`. Where they set a timing, a level of accessibility or a pattern, they win over the general figures below.
- **A glossary** of the terms the interface uses, if the project keeps one.
- **Who it is for**: the users, personas and scenarios the product doc describes. Use them as written and never write one of your own: a persona the agent invents is the project's assumptions echoed back ([NN/g](https://www.nngroup.com/articles/persona/)).
- **What already exists**: the components, tokens and patterns the change can reuse.

## Before designing

1. **Start from the builder's design.** Ask whether a mockup or prototype exists, and look for recent design files beside the repository. Build from it where one exists.
2. **Name the job before the mechanism**: what the user is trying to get done, in their words. "Room for more text on the focus" picks a different mechanism from "zoom".
3. **Name who**, from the project's users and scenarios. Where it has none, state the user's situation in one line and mark it an assumption.
4. **Walk the path in order**: the steps before this change, the steps after it, and the branches a user can take, such as nothing found or offline. Say which step this change is.
5. **Name what stays constant**: "one fixed zoom level" picks a different mechanism from "fit the content".
6. **Read what governs the look**, in its own words and for how binding it says it is: the design principles, the standards, and the glossary entry for each term the interaction touches. A working idea is not a ruling, and an option it doesn't rule out stays open.
7. **Reuse before adding.** Read the nearest existing component, and keep one name for one action through the whole path.
8. **Cost each option from its smallest version**, and a lost behaviour, such as heading depth, from the platform's own means of keeping it, such as `aria-level`.

## Showing every state

Show the states the user reaches, not the resting case alone:

- each kind of piece in the position being designed, at the length it really holds;
- long text: sentences that wrap, many children;
- each control's states: default, hover, focus, active, selected, disabled; a field being typed in; the moment after something is added;
- loading, empty and error, each designed: never a blank area, and never "nothing here" while it is still loading;
- each change in layout, and how it shows: something appearing, moving, scrolling;
- a signal in both cases: with something to signal, and without. If the two look the same, it signals nothing. Focus and selection are two signals and must look different.

Where something covers a control, click it and Tab to it before calling the overlap a look issue: a control hidden behind a sticky header or banner while it has focus is a failure ([WCAG 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).

Judge each state as the user sees it, on a fresh full-page load of the build handed over. A claim about how the build behaves is made after doing that thing in it.

## Waiting, feedback and motion

- Under 0.1 s, show only the result. Past 1 s, show that it is working. Past 10 s, show progress and a way to stop ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)).
- Motion answers an action and is as short as it can be without jarring: about 100 ms for small feedback, 200–300 ms for a larger change, shorter still for something done often ([NN/g](https://www.nngroup.com/articles/animation-duration/)).
- Never make the user wait for an animation before their next action, and honour `prefers-reduced-motion` ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/motion)).

## Mistakes and recovery

- For each action that can fail, be slow, or destroy something, show what the user sees and how they get back: undo, retry or cancel.
- Prefer undo to a confirmation. Confirm only what cannot be undone, say exactly what will happen, and name the outcome on the button, such as "Delete chapter" rather than "Yes" ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)).
- An error message says what went wrong and what to do next, beside where it happened.

## Keyboard and assistive technology

- Every pointer action has a keyboard path, and Tab reaches each control in the order the page reads ([WCAG 2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)).
- Focus is always visible ([WCAG 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), AA). [2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html), a 2 px outline with a 3:1 contrast change, is the stricter AAA target.
- When something is added, deleted or moved, say where focus goes next: the new item, the next one, or the control that did it. It never falls to the top of the page ([ARIA APG](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)).
- A change made without a page load is announced: politely by default, assertively only for an urgent error, from a live region that exists before its text changes ([MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)).
- Use the native element, such as `<button>`, `<a href>` or `<label>`, before a role and a key handler.
