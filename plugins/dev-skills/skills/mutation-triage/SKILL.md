---
name: mutation-triage
description: Triage surviving mutants from a Stryker run — classify each as known, refactor (dead branch), noise, or fixable, then remove dead branches, record noise, and write the tests that close real gaps. Use after any mutation run, whether it covered one file or the whole project.
---

# Mutation Triage

Classify every surviving mutant in scope and take the right action for each. The classification, and what it demands of you, are the same whoever called this skill; the caller supplies what differs between projects and runs.

## What the caller supplies

If the caller did not say, ask — do not guess. The two with defaults are the exception.

- **Scope.** Which mutants to triage: one file's survivors (a change in flight), or every survivor in the report (a project-wide sweep).
- **How to record a noise survivor.** A comment at the line, or a tracking issue. See Step 5.
- **Report path.** Default: `reports/mutation/mutation.json`, Stryker's default for the JSON reporter.
- **Accepted survivors.** Where the project lists survivors it has already accepted, if it keeps such a list. Default: none, so every survivor is classified from scratch.

**There is no score threshold here.** A project-wide score says nothing about the file you just wrote — a new module can sit at 54% while the project reports 79%, because the rest of the codebase carries the average. Triage the scope you were given whatever any score says. Deciding *whether* to run at all belongs to the caller.

## Step 1 — Verify the report exists

If the report is missing:

- Print: `ERROR: Stryker JSON report not found at <path>. The mutation run may have crashed before writing output.`
- Stop here. Take no other action.

## Step 2 — Read the report

Collect mutants whose `status` is `"Survived"` or `"NoCoverage"`, restricted to the scope you were given. Every other status (`"Killed"`, `"Timeout"`, `"CompileError"`, `"Ignored"` and the rest) is out of scope. If the project keeps an accepted-survivors list, read it too; it is your reference for the **known** class.

Each relevant mutant carries `sourceFilePath`, `location.start.line` (1-indexed), `mutatorName` (e.g. `ConditionalExpression`), and `replacement` (the mutated snippet; empty for `NoCoverage`).

## Step 3 — Classify each survivor

Every survivor gets exactly one of four classifications. "The score is high enough" is not a classification.

**known** — File, line and operator semantically match an entry in the project's accepted-survivors list. No action.

**refactor** — The branch cannot be triggered by any realistic input. The code is the problem, not the test gap. Test it by naming a concrete input for each branch of the condition: a branch you cannot name an input for is dead. A guard (null check, boundary check, type narrowing) whose fail path no realistic input reaches is guarding against a case the types already rule out.

**noise** — Not a known survivor, and the branch genuinely *can* be triggered in production but not from test infrastructure (a subprocess-only path; a method a framework invokes only during startup). Distinct from **refactor**: the code runs in production, the harness just cannot reach it.

**fixable** — Anything else. A survivor whose mutated path a test *can* exercise.

Tie-breaks: uncertain between noise and fixable, prefer **fixable** — let a test decide. Uncertain between refactor and noise, prefer **refactor** — restructuring beats documenting an accepted survivor.

## Step 4 — Act on refactor survivors

Dead code. Do not record it anywhere; remove it.

1. Read the source around the surviving line.
2. Identify the unreachable branch. Common shapes: a null guard on an API return the types already narrow; `>=` vs `>` at a position no input reaches; `arr[0]` after an `arr.length === 0` check.
3. Restructure so the impossible case is not representable — prefer APIs returning narrower types, identity over position comparison (`node === target`), destructuring over index access (`const [x] = arr` rather than `arr[0]` plus a separate length check).
4. Run the project's checks, then re-run mutation on the file. **The mutant must be gone.** If it is not, the branch was reachable after all — reclassify.

If you cannot make the branch reachable and production genuinely needs it, reclassify as **noise**.

**Check whether the branch's two arms do the same thing before reaching for Step 5.** A condition whose arms leave the same state mutates to a survivor no test can tell apart, and deleting the distinction is cheaper than recording it: measure by opening the branch and running the file's suite. A noise record is for a branch whose arms do differ — it names the behaviour, and why the harness has no way to construct it.

## Step 5 — Act on noise survivors

A noise survivor needs a durable record of *why* it cannot be killed. Without one the next run re-triages it from scratch, and a real gap hiding among them stays invisible.

Whatever form the caller asked for, the record names the file, the line, the operator, and the reason the harness cannot reach the path. Write that reason in terms of the code's behaviour — a reader should learn why the method exists and who calls it, not that a mutant survived. Group survivors sharing one cause into one record.

Do not edit the project's accepted-survivors list; the record you create is the signal that a human should update it.

## Step 6 — Act on fixable survivors

For each, read the source around the surviving line, then write tests in the corresponding test file that exercise the mutated path.

- Follow the project's existing test patterns.
- One test per survivor minimum; add boundary cases where relevant.
- **Test from the altitude real callers reach the code.** A direct test of a helper can hand it inputs its callers never produce, so it covers a path that does not exist. If the only way to reach a branch is an input no caller produces, the survivor is **refactor**, not fixable.
- **Verify the kill, don't assume it.** A test written against a survivor has no red phase — the code it targets already works, so it goes green the moment you write it and tells you nothing. Before counting a survivor closed, make it fail: apply the mutant by hand, or revert the line it targets, and confirm *that specific test* reds. One that stays green is not reaching the line.
- **If the re-run still shows the mutant, the report is right.** When a survivor or `NoCoverage` entry persists after you added a test claiming to exercise it, that contradiction *is* the finding. Resolve it by fixing or deleting the test — never by reclassifying the mutant as unreachable. A test asserting it drives a path, sitting beside a report saying nothing does, is precisely the shape of coverage that is not there.

Then run the project's checks and iterate until they pass. Leave the changes uncommitted; committing, branching and opening a PR belong to the caller.

## Step 7 — Report

```
Triage complete (scope: <what you triaged>).
  Known (no action):    <N>
  Refactor → removed:   <N> (<files>)
  Noise → recorded:     <N> (<where>)
  Fixable → tests:      <N>
  Score: <before> → <after>
```

State any survivor you could not classify, and why. An unclassified survivor is an open question, not a rounding error.

## Constraints

- Never create issues or records for mutants with any status other than `"Survived"` or `"NoCoverage"`.
