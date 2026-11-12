---
name: implement
description: Use to implement a ready story, task or bug across the pull requests its issue plans, handing each one over reviewed. Also use when the builder says pick up, resume or carry on, or asks for a pull request's review findings to be fixed.
---

# Implementing a story

Work comes from an issue labelled `ready`: the builder's agreement, made after reading it. Implement it as a series of **slices**, each one pull request, and hand each over reviewed. Run as `/skill:implement N`.

## What the project supplies

- **Contributing doc** (default `CONTRIBUTING.md`): the check command, how to verify a change, the ready command, the commit and title standard, the standards index and the pull request template.
- **Docs to read before planning**: the architecture doc, the decision records, the glossary.
- **Notes folder** `.omp/agent-notes/`, which the project git-ignores.

## Gates

- No issue number and no open pull request in the conversation: ask which issue. Never infer one from the branch, the last commit or earlier conversation.
- No `ready` label: say the builder agrees by adding it, and stop. Add the label only with the builder's consent.

## Plan the slices

An issue with no plan comment gets a plan before any code.

1. Read the issue, its epic, the architecture doc and the decision records it touches.
2. List the open questions whose answer changes which slices there are, what they hold, or what one must decide: what a tool, library or the platform does, or whether an approach works here. Probe each outside the working tree: current docs linked beside the finding, or a short run in a temporary directory or scratch clone. Keep a run's output as it came out and post it on the issue in its own comment before anything cites a number from it; the plan, record or pull request body links that comment. A question no probe settles is listed as open. A probe that becomes code the story ships (a harness, fixture or script) stops, and that code becomes an enabling slice. No open questions: say so.
3. Assess the files each candidate slice would touch against the standards index and the architecture doc. Where the change would copy or strain a pattern, weigh continuing it against refactoring first, as weighing-options says, and take the options to the builder in the proposal. A chosen refactor becomes an enabling slice. Cleanup in a file a slice already touches is part of that slice.
4. Cut the slices. Each is thin, stands on its own and ends in something the builder can check. Enabling slices come first. Prefer slices that need only `main`, so one can start while another is in review.
5. Propose them, numbered, each an imperative phrase that becomes the pull request title. Add each open question: what was probed, what it showed, what is still open, which slices rest on it, and each strained pattern with the options weighed.
6. Post nothing until the builder confirms. Then post each probe output, then the slices as a checklist comment with the open questions and findings beneath it, and start the first unstarted one.

Tick a slice off as its pull request merges. The last unticked slice's pull request closes the issue.

## Confirm the approach

Before a slice's first commit, send the builder one message with each class below, and wait for a yes. A class with nothing to settle says `none`. A part that comes up mid-build goes through the same gate. Record each answer in `Decisions`.

| Class | Say |
| --- | --- |
| Tooling | Existing scripts, skills and tools that cover part of it; any dependency you chose not to add |
| Architecture | Any change to the architecture doc |
| Decision records | How it follows each one touched. A challenge names the record, what this slice shows it missed and what you would decide; a yes adds a superseding record (writing-adrs) to the plan, ahead of the slice that depends on it |
| Reading the issue | Any criterion with more than one reading, and yours |
| Scope | Anything beyond the slice, including changed or removed behaviour |
| Domain terms | Each glossary term used, added or carried forward, its meaning and how code uses it |
| What the writer sees | Copy, interaction and layout, worked out as designing-ux says and shown from the repo's built app with the change applied in a scratch clone, never a standalone mock. Serve it; give the address and what to try |
| Stored data | Its shape, and what happens to data already saved |
| Test strategy | The level of each case, what is faked, the file each lands in |
| Standards and architecture | Re-read the files the slice now touches against the standards index and the architecture doc. List each place the plan did not foresee that breaks or strains one, with file and line, and weigh it as planning does: continue the pattern, refactor first (in this slice or landing before it), or challenge the standard |
| Claims | For each claim about behaviour ("unchanged" included), the case that fails if it is false. Gaps become cases. Name the laziest wrong implementation each case catches that no other does; a case naming none is cut |

The plan stays titles: approach is set out one slice at a time.

## Start a slice

Start once the builder has said yes to the approach.

- Branch from an up-to-date `main` in a worktree of its own, named as the commit standard says, with the slice's title in kebab-case: `git worktree add ../<branch> -b <branch> origin/main`, removed with `git worktree remove` once the slice merges. Two slices of one issue can be open at once, so name it for the slice. The main worktree is the builder's, so never switch its branch. A slice that needs another's unmerged work branches from that branch and retargets to `main` when it merges; this is the exception.
- Set the worktree up as the contributing doc says, so its git hooks run.
- Make the first commit empty, its subject the pull request title, and push.
- Open a draft pull request from the template, `Part of #N` at the top. Fill `Brief` for an agent that saw none of the conversation: the criteria the slice covers, the confirmed approach, the files it starts from, the interface it changes, where each test lands. The last slice says `Closes #N`.
- Dispatch the `execution-agent`: its task names the pull request number, branch, the worktree's absolute path and the model it runs as. A brief across several areas goes in batches, one area each, reading the notes and commits before the next.
- Keep the criteria table current: a row per criterion and edge, its test or link, and where it ran.

## When the execution agent returns

Read its notes (`.omp/agent-notes/<branch>.md` in the worktree) and its answer, then:

- put each assumption and change of approach in `Decisions`; one the builder has not confirmed goes to them first, through Confirm the approach, before anything builds on it;
- put what would have saved time in `Learned`;
- draft each find outside scope as an issue and file it on the builder's go; batch one-line finds into one issue;
- verify the change as the contributing doc says, before dispatching again or handing over: a problem goes back to the execution agent as a `### Findings` item in the `Brief`;
- take a stop to the builder in a message of its own before dispatching again.

## Resume

With an open pull request for the issue, carry on from its body: plan, progress, confirmed approach and criteria table. Do not re-plan or open a second pull request. If handed over with review findings, fix them as Hand over says. With none open and earlier ones merged, tick them off and start the next. With nothing left to tick, the issue is finished: say so.

## Hand over

The main session runs every step. Dispatch the execution agent only for a finding step 2 sends back.

1. **Review** the whole diff against `main`, not the last commit, as the `reviewer` agent. Give it the range, the brief below and nothing else: no finding you already have, no suspected part, no summary. The reviewer's instructions hold the rest.

   > Review this pull request's change, not the story behind it. Did we build the right thing, and did we build it right? Judge as the domain would and as an application in the domain would. Does the diff do what the body says? Do the body's claims hold against the tree? Does its prose break a rule the repository sets itself? Start from the standards index. Findings only, strongest first, each with file and line, no summary. A story-level gap is an aside, not a finding. Check every claim about how a tool, library or platform behaves against the link or run beside it, and read that source yourself: a claim with neither is a finding, and so is a test stub that differs from the tool it stands in for. A new or changed decision record that fails a writing-adrs test is a finding naming the test. On each changed doc page, judge every section, row, diagram and link against the page's Audience and Purpose lines: one that serves neither, or repeats what another page owns, is a finding. Where the body says `Closes #N`, audit the story too: every criterion and edge against the evidence across the plan's pull requests, the plan comment against what merged, and every call the story left open.
2. **Fix each finding**, or record in `Decisions` why it stays. Fix yourself what you can make and check in minutes, with absolute paths under the worktree. Longer ones go to the execution agent: add under `### Findings` in the `Brief` and dispatch again. Mark a finding fixed only with the file and line you read after the fix. Then review the fixes alone, from the commit the first review started at, and fix what it finds. A small improvement in a file the slice touched is made in the slice and noted in `Decisions`; one that strains a pattern the slice builds on belonged in a preparatory slice.
3. **Fill `Learned`**, capturing each lesson as an incident (lessons skill).
4. **Fill the criteria table** and the `For review` list.
5. **Fill `How to verify`** and give it in the conversation. Verify as the contributing doc says first, and write what you saw, not what you expected.
6. **Mark ready** with the project's ready command, and fix each condition it names. A push resets the claim: before any status report on a pushed pull request, run its check form. Before the builder merges, say what is still open, such as a review not back or a check not re-run since the last push.

## Work found outside the issue

Never build it here. Draft the bug, story or task in its template, show the builder, file it without `ready` once they confirm, name it in `Decisions`. Batch one-line finds into one issue.

## Build rules

- Build to the issue's criteria, agreed before any code. Edit the issue only at the builder's request: show the new wording, edit on their yes, record it in `Decisions`. Where you disagree or it left something open, propose the call through Confirm the approach. A change of scope goes back to the builder.
- A question or aside is answered and changes nothing on its own. Where it points at a change of scope or an unplanned call, ask for a direct yes first, and name it at each hand-over until answered.
- Something already written that fails the durable-writing relevance and placement check goes to the builder, not built on or moved.
- Each slice is one pull request, squash-merged through review. Never push to `main`. Every edge the issue lists needs a test in the table.

## Done

- Architecture doc updated for any change to shape, parts or constraints, with a decision record when writing-adrs says so.
- Each new term used in code, scenarios or UI is in the glossary.
- `Learned` is filled and captured.
- Each case's test was written before its code and seen to fail while the others pass, by breaking the code that should catch it on committed work, then reading the file after the break is undone. Hooks and rules the change adds are seen to fail on their case. The run is linked from its row, or described when it ran locally and nothing it covers depends on the machine.
- A run is evidence only when its answer is not already written where it can read it: in what it is handed, in files it reads, or in a harness beside it (stand-ins, logs, other cases' inputs and answers).
- A task's `Done when` lines carry the evidence its template asks for.
- The pull request is handed over: reviewed, findings fixed or answered, marked ready.
