# OMP workflow review

**Audience:** Dan and the agent, during this review.
**Purpose:** one record of the problems found in how the agent works, and the improvement proposals that come out of them. Nothing here rests on session memory.

How we work: one thread at a time, Dan steers after each. Findings first. A proposal lands here only once we have discussed it — marked discussed · agreed · parked — and un-discussed candidates stay in the conversation. Nothing runs or writes anywhere else without Dan's word.

**Handing over (17 Oct).** This file is `~/Projects/snippets/omp-workflow-review.md`, and the ledger it leans on sits beside it in `~/Projects/snippets/omp-notes/` — both untracked in that repo: local-only, as the ledger's extracted data is. The repo under review is `~/Projects/working-title`; the `#N` references throughout are its issues and pull requests, and the file paths without a directory are its own. An incoming agent should read Next steps, then ask Dan which thread to take. Nothing here is decided except what Decisions holds; "discussed" is not agreement; thread 1 describes an incident rather than ordering work. The method behind every figure is in "How these numbers were got" at the end — and the ledger's extract runs behind the store, so `notes.py extract --project working-title` comes before trusting `report`, with `notes.py behaviour --project working-title` for the steer and abort counts.

## Thread 1 — The nine-agent batch, 17 Oct

**Problem.** Six minutes after Dan's concerns landed (12:17), the session bought nine `seance` agents in a single call: every item pinned to `claude-opus-5-5:medium`, every agent loading one whole past session (160k–430k tokens each), read-only. All nine died on rate limits within 20 seconds. Cost $17.94, and the 5-hour Claude window went with it.

**So far.**
- Research was needed; that batch was not the research the moment needed.
- The model is the multiplier: the same work on a cheap model is about a dollar and never touches the Claude window. But the batch stands on any model — cheap agents would still have produced nine unasked-for reports.
- The expensive part is the load, and it is paid at spawn — before any result, any failure, or any correction can change course.

**Proposals** (discussed; decisions open).

**1. A gate before fan-out.** A call that buys more than two agents at once, or pins the expensive model to a read-only agent, stops and asks — what, how many, which models, what each will load, and a rough cost from the session files on disk. Form: an extension on the spawn path (snippets, user-level, every project); zero-code alternative: `tools.approval.task: prompt`, where every task call asks, and headless subagents lose the ability to spawn.
*Fixes:* the missing interlock — money moves only after the shape is seen, including explicit pins.
*Costs:* an hour of build, tested against the nine-agent case; a prompt whenever a batch or an expensive read-spawn is attempted.
*Open:* build the extension, flip the blunt version meanwhile, or both?

**2. Unstated → cheap.** `modelRoles.task: "@smol"` — spawns where nobody named a model run cheap; naming Opus is the deliberate act. Per-agent class overrides dropped; possible exception: one direct `task.agentModelOverrides.scout` line.
*Fixes:* the multiplier — unpriced work lands cheap and off the Claude window. It does not stop an explicit expensive pin; that is #1's job.
*Costs:* read work runs on a cheaper brain; the model gets named when the problem needs more.
*Open:* set the line now — and the scout override: set it or verify first?

**3. Session research goes extract → analyse.** A cheap pass sweeps the bulk and keeps evidence with pointers (timestamps, ids, quotes); the good model reasons over the small bundle. Deterministic extraction (grep, JSONL parsing) where structure allows. Three shapes, chosen by the problem, shown at the gate: scout+grep (pointed), cheap seance (whole-session context), source-model seance (context + continuity).
*Fixes:* the load — the actual money (160k–430k tokens per whole-session fork) — and fan-out stops being the default shape.
*Costs:* a lossy extraction poisons the analysis invisibly; pointers are the guard. Cheap seance gives up the source model's judgment.
*Open:* adopt as practice; build the extractor (session file(s) → one evidence bundle); write the practice down rather than leave it a habit?

**Considered, not proposed.** `task.maxConcurrency` — a burst trickles instead of bursting, but every spawn still pays its load at the start, and it slows legitimate fan-out. The runtime caps (`maxRuntimeMs`, soft request budget) throttle agents that are already bought.

**To verify when building.** Whether `task.agentModelOverrides.seance` beats the source-session model's inheritance; where `modelRoles.task` sits in the fallback chain; what model scout/sonic resolve to by default.

## Thread 2 — The money across sessions

Headline: 14 sessions (working-title), $270 recorded over nine days — advisors $159 (59%), subagents $59, main $51. `omp stats` agrees where its window overlaps ($118 for the last ~24 h: advisor $61, subagent $36, main $21). 64 aborted turns as this pass counted them — 70 by the reply-level definition in the provenance section; 15 rate-limit errors.

Reviewer split (delivered notes): turn — 13 blockers · 118 concerns · 51 nits, $73.37; final — 1 · 99 · 36, $82.23. Overlap between them ≈ zero (one same-issue pair); different classes, not duplicates. Nits skew to the turn reviewer (51 vs 36) and cost less each ($1.44 vs $2.28).

What the notes bought (judgement pass, 17 Oct). Method: read all 16 blocker deliveries and a spaced sample of 12 concerns + 12 nits, with the run's next messages.
- Blockers: 15 of 16 visibly actioned; one silent in the window. Caught: a self-contaminating probe that invalidated the whole `./do add` mechanism before it shipped; uncommitted work lost to `git checkout` (×3); a PR made ready or pushed without the builder's go; an edit left in the wrong worktree.
- Concerns: 10 of 12 actioned, 1 reasoned with justification, 1 silent. Examples: acceptance-table claims no run backed; a layer-check regex missing folder imports; a scratch Vitest config that would have moved every test file into Chromium.
- Nits: ~5 of 12 actioned, ~4 silent, the rest engaged or triaged ("six of these are outdated; three are live" — late notes go stale).
- Caveat: a 5-message window per note; "actioned" means visible engagement, not proven compliance.

**Observation (agent, 17 Oct).** This review ran with the advisors on, so the same instrument met a session whose artefact is prose rather than code. Ten notes arrived; the catches repeated the ledger's classes — claims beyond evidence (an intent asserted for the plugin's scope, "nothing chose it deliberately", where `./do setup` installs it on purpose; a count taken from a discarded first run; a host list counting the adapter omp actually loads among "fourteen other hosts"; a class no run had established), a finding dropped in a rewrite without saying so, and wording. Two notes were stale on arrival, resolved by work done between issue and delivery; one was prescriptive past the question ("read the Plan comments of 16, 17, 19, 21, 35"), which Dan's steer — the log mining was churn — declined. No note was wrong on a fact.

What that pair does and does not supply. **It catches contradictions**, inside the artefact and against the sources it cites: the host count against the adapter omp loads, a number from a discarded run, a count of lines against a count of pull requests. **It can out-ground the executor:** the ponytail wiring was written up here as `pre_llm_call`/`pre_gateway_dispatch` and per-project flags — every one of them another host's — and the note naming `pi-extension/index.js` is what settled it. **A note's suggested reading is a hypothesis:** `.agents/rules` and `.agents/plugins` were not where the wiring lived. **Cost per catch:** on prose each catch costs a re-read of a watched source rather than a test run, so the reviewer's value tracks whether the artefact leaves the session (a doc, a pull request, a reply) rather than whether the work is code.

**Candidate (Dan, discussed).** Improve the executor instead of buying every correction downstream. A large share of the reviewer catches are the execution agent's own errors — restores, unbacked claims, contaminated probes, wrong-worktree edits, process-order slips. Each is a symptom that the worker's guidance, context or quality let through; fixing upstream shrinks what the reviewers exist to catch. Sub-areas to pin down when taken up: guidance (skills, AGENTS.md), context management (conversation and workspace state), model and thinking quality. One lever, not a bundle.

**Candidate (Dan, discussed).** More skills, and dev sessions cut into batches — the mechanism for the executor candidate's context leg. Rationale: a fresh context gives the instructions — system prompt, context files, skills — their full weight, where a long run dilutes them. Data agrees in shape: the busiest sessions are the hottest (16 Oct: one with 28 steers, another with 11 aborted replies), "your context is a bit big" arrived as a steer, and corrections pile up deeper into runs. Open: the batch boundary (a plan line is the natural unit, and the flow already says fresh sessions per line); the handoff cost (resume-from-PR-body already carries state); and which skills are missing — pair mode, the funnel recipe, the review sitting are the candidates this review surfaced. Side effects: each batch end is a checkpoint, and a smaller run is a smaller review bill.

**Note (Dan, discussed).** Executor improvement does not reduce the reviewer bill. The bill is inspection surface — run size × cadence × model × reviewer count — and it does not move with what the reviewers find. Executor quality changes the catch mix and is the precondition for cutting reviewer coverage, not a saving in itself. Track the bill and the catch mix as separate series: as the executor improves, $/note worsens while the work improves.

**Issue sorts (from the 17 Oct passes).**
- Nit taxonomy, 93 nits: 85 real at the repo's bar · 2 trivial · 3 taste or scope · 3 self-correction or repeat.
- Deterministic-checkable: ~14 clear + ~6 partial (15–20%) — links (5), compile and mutation status (3), hygiene (2), grep conventions (2), lessons lint (2), ad-hoc recounts (3–4).
- Guidance defects, 9 generating 12 notes: issue-type boundary (skill vs `bug.md`); task-template `Done when` comment; PR-template colon; "Decisions" edge case; dev-flow pronoun; the `_` convention lost; AGENTS.md antecedent (×2); lessons-row branch clashes; link durability (`agent://`, `omp://`) ×3.
- Catch character: blockers dominated by executor error-class catches (restores, unbacked claims, contaminated probes, worktree, consent); the wider sample mixes error-class with judgement-class (test validity, config scope, template fit).

**Note (Dan, discussed).** The reviewer model is unvalidated. Both reviewers run Opus because the advisor role points there — nothing measured that it is the right model for either job. Model price is one of the bill's four factors and the only untested one. The catch classes differ in difficulty — mechanical and textual (links, bookkeeping, template fit), subtle (contaminated probes, mutation no-ops, lost state), decisive (interruptions) — so turn and final may not want the same model. Test in one window and compare the mix value-weighted, not count-weighted; watch that a cheaper turn reviewer under-blocks.

**Proposals** (discussed; decisions open).

**1. Turn the check-shaped ground into checks.** The five clusters from the nit pass: links (PR and issue bodies, and the `agent://`/`omp://` schemes); lessons lint (a row whose tripwire already exists, duplicate rows); grep conventions (`shortcut:` format, `node_modules/.bin` in docs); hygiene (untracked files before commit, the exec bit in the index); compile and mutation-status visibility. Mapping the final reviewer's ground onto checks is the backlog-ordering step inside this.
*Fixes:* the classes the reviewers keep re-catching, and the ones that ship anyway.
*Costs:* build and upkeep per check — working-title's through its issue flow, harness ones in snippets.
*Open:* which two or three first (the mapping orders it).

**2. Run the reviewer-model experiment.** One window, models swapped; arms: turn-cheap + final-strong (and the reverse), plus a cross-family reviewer. Read through the ledger, value-weighted (class × surface); watch under-blocking on the turn reviewer. Baseline: the 17 Oct passes.
*Fixes:* the untested "Opus for both" assumption, on the biggest line item.
*Costs:* one window of possibly weaker review; needs a classification sitting.
*Open:* when to schedule.

**3. Adopt the ledger as the standing measure.** `notes.py extract` per window; classify in a sitting; read the mix.
*Fixes:* "did it diminish over time", executor progress, and the read for #2.
*Costs:* the sitting — judgement, not automatable.

**4. Keep both reviewers until two conditions hold, then cut with the mix in hand.** Conditions: the checks from #1 have landed, and a ledger window shows error-catches falling.
*Fixes:* cutting blind.
*Costs:* none beyond the bill running as-is; the repeat test runs inside this.

**Ledger and lessons (discussed).** Different truths: lessons.md is the repo's memory of claims — rule plus tripwire, in every working agent's context, checked by `./do lessons`; the ledger is the harness's memory of instances — note, outcome, class, cost, read in sittings. They join by one `lesson` column, which turns the repeat test into a query, and the ledger's check clusters become the backlog that lessons' tripwires point at: ledger → checks → lessons-with-a-tripwire. Found-in stays lessons' recurrence count; the ledger counts instances and outcomes.

**Cross-project and repeat checks (17 Oct).**
- Weaver: 20 sessions, 142 notes, $419 recorded — advisor $224.96 (54%), ≈$11.25 per session, near-identical to working-title's ≈$11.40. Those sessions predate the roster (unnamed default advisor), so the tax is the advisor machinery itself, not a roster artefact.
- Repeat test, first pass (keyword alignment, noisy; matches eyeballed): most blockers land on lessons rows that already exist. Three land on the tripwired "A restore is read back before the next run is believed" row — and some of those are the very findings that created it, so the timing question (was the tripwire in place before the note?) is what separates "created it" from "met it again". One lands on "An aside from the builder is information, not an instruction" (tripwired). Several land on rows with **no tripwire**: "A run is only evidence if the answer is not already written where the run can read it", "The builder's own working tree is theirs", "A reply says done only for what a tool result has shown" — the class nothing else catches. This is thread 3's opening move.

**Final reviewer's ground → checks (17 Oct).** Its 99 concerns and 36 nits classified one bucket each, by eye.
- **Scriptable, small: ~12 of 99** (+ ~8 of its nits). In backlog order: lessons lint — a row marked `proposed` with no lesson PR, duplicate rows, a tripwire silently removed (4); readiness evidence — a PR ready or handed over with the checks never run on its head commit (3); recounts and status facts — commit counts, open/closed, hashes (5).
- **Session-guard material: ~7** — calls to the builder buried in a status report (AGENTS.md "a message of its own"). Not deterministic, but a `session_stop` or stream-rule guard with a cheap model holds it.
- **Model judgement: ~80** — dominated by one class: claims the run's own evidence doesn't support (~43). The rest is engineering judgement: test validity, source contradictions, design conflicts, consent and priority (~37).

Backlog order for proposal 1: lessons lint → body and link checks → readiness evidence gate → the buried-call guard. The claim-audit class goes to proposal 2's arms rather than a script — it is narrow enough to be a scoped pass on a cheaper model than the reviewer, which is itself a finding.

## Thread 3 — The lessons log

Walked 17 Oct. Material: the file (43 rows), `./do lessons`, the Found-in lists, git history, and thread 2's repeat test.
- 43 rows; 29 (67%) carry `none` as the tripwire. Of the 14 tripwired rows, **13 point at prose** — AGENTS.md, skills, standards — and exactly one at a check (`./do check-links`). The file's own rule: a check wherever one can be written, a rule only where none can.
- The top row is ×8, and not for lack of attention: its tripwire (AGENTS.md, "What you assert") landed in #28; the row was found again in #51 and #57; #61 is a PR line titled with exactly this lesson; and it still recurred at #62, #63, #68.
- Tooling: `./do lessons` owns the 50-commit window and prints entries past it; recurrence ("two inside the window") is left to whoever reads the Found-in lists — the tool prunes, it does not propose.
- Churn: 25 commits touch the file — the Learned/Found-in update rides nearly every PR, so the record is maintained by the flow.
- Thread 2's repeat test: reviewer notes keep landing on these rows — several on `none` rows (nothing else catches those), some on tripwired rows that did not stop the failure.

**Read (agent).** As a record it works: honest rows, recurrence ordering, maintained by the flow. As an enforcer it is mostly prose — and the ×8 row is the proof that prose does not enforce: rule, dedicated fix, three finds after. The 29 `none` rows are exactly what the reviewers catch today, so part of the review bill is the enforcement layer this file lacks. The thread's question: which rows can become checks, and which are accepted as rule-only.

## Thread 4 — What the harness allows

Walked 17 Oct. Material: the live config, and the harness docs read through this review (task, extensions, hooks, advisors, marketplace, models/settings).
- **The gate exists.** `before_subagent_spawn` fires per spawn in the parent — it can block, or replace the model patterns and attach a note; `tool_call` handlers can block a batch or rewrite its arguments; `tools.approval.<tool>: prompt` is honoured even under yolo; `ctx.ui.confirm` gives a yes/no; hooks fail closed. Adding a `tool_call` handler also disables speculative launch, so a gate sees the whole batch before anything starts.
- **Defaults are overridable.** Per agent (`task.agentModelOverrides`) and per role (`modelRoles.<role>` — `task` is a built-in chat role). Seance takes the source session's model unless the caller names one, and naming works — the incident's call proves the field is wired.
- **Visibility exists, outside the loop.** `omp stats` (per model, folder, agent type — summary, JSON, dashboard), `/advisor status`, the status line's cost readout, recorded cost in every transcript. Nothing can say "that will cost X" at the moment of spending.
- **Cadence and caps.** `advisor.reviewInterval`, roster `reviewMode`/`syncBacklog`, `maxNotesPerUpdate`, `immuneTurns`; `task.maxConcurrency` (32), `softRequestBudget`, `maxRuntimeMs` (0); `prewalk`.
- **Session shaping.** Plan mode (read-only; disables seance and isolation); compaction and recaps; steering with immediate interrupts; resume-from-PR; skills — managed ones available, autolearn off; the plugin/marketplace path for shipping harness items; `session_stop` can refuse a finish; TTSR stream rules.
- **Budgets.** No global spend ceiling. Goal mode carries a per-session token budget; the caps above throttle work that is already running — none of them stop the spawn, which is where this money goes.
- **Unverified, for build time:** whether `agentModelOverrides.seance` beats source-model inheritance; where `modelRoles.task` sits in the fallback chain; what scout/sonic resolve to by default.

**In play in this setup (17 Oct).**
- Prewalk is on with the default target `@smol`: planning on the session's starting model, one-shot handoff at the first eligible edit/write after the todo gate opens. Observed: handoffs at turns 50 and 77 right after the first edits; one session held the planning model ~126 turns before the gate let it through; this session never armed (a temporary model change to deepseek 21 s before the prompt); one session returned to Opus for its tail — plan mode's role switch or a manual change.

**Read (agent).** Every intervention from threads 1–3 already has a mechanism to sit on — the block/route hook, the approval policy, the model overrides, the cadence knobs, the repo's own checks. The one genuine gap is the spend moment: nothing in the loop can price a spawn, so a gate has to bring its own estimate.

## Thread 5 — Pairing and communication

Findings from the steering pass (17 Oct): every mid-run user message flagged `steering` across the working-title sessions, aborted turns counted alongside.
- Contact is dense: **154 steers over 11 sessions** (busy ones 10–28 each) and **65 interrupted replies** — the 70 replies carrying `stopReason: "aborted"`, less 4 that are `Request was aborted` at session close and one uncategorised. Most steers are shallow — 88 of the 152 the pass first counted arrive within four tool calls (direction, answers, merge notices); 16 land right after a `wait`/`ask`, where the agent had handed the floor back.
- The friction is specific: 16 steers interrupt work 20+ tool calls deep; 9 are explicit attention reclamation — an answer or an update chased, a merge announced because silence had stretched; a dozen-plus carry open frustration, concentrated in the 9 Oct lessons-ledger design and the 16 Oct sessions.
- Recurring correction themes: claims beyond the evidence (a promise of change the next session cannot keep; a story draft where the shape was wrong; agreement given without judgement); acting on a question instead of waiting — the agent asked and kept building, so four of the seven builder comments were questions answered with code changes; the floor buried by background work ("you're asking me questions but doing 1000 things in the background"); the builder's own calls put back on the table (a deleted test offered again).
- Convergence: the human-side top correction class — claims beyond evidence — is the final reviewer's top catch class too. Two instruments, same defect.
- Proposals: not started.

## Thread 6 — Ponytail in the setup

Raised by Dan, 17 Oct, after asking what ponytail is and whether it is feedback: "possibly ejecting and extracting… could also conflict with non codey modes". Material: the installed plugin read directly (`plugin.yaml`, `package.json`, `pi-extension/index.js`, `skills/ponytail/SKILL.md`, the Claude-side hooks) against omp's own hooks and marketplace docs.

**Problem.** The setup installs a coding discipline for every session, where the repo calls it the skill the build work runs under: `./do setup` installs it into OMP on purpose, and `scripts/setup`'s own comment repeats dev-flow's line. It runs at `full` here, and the gap between those two scopes — the injected section reaches design talk, story work and reviews as well as builds — has never been weighed.

**What it is.** `ponytail@ponytail` 5.1.0 (`DietrichGebert/ponytail`), user scope, installed 9 Oct, loaded by omp as a pi package — `package.json`'s `pi.extensions`, the legacy key omp still accepts beside `omp.extensions`, resolving to `pi-extension/index.js`, with skills from `./skills` (six skills, six commands). The extension sets the mode-filtered body of `skills/ponytail/SKILL.md` as a system-prompt section on `before_agent_start` (`systemPromptOptions.sections.ponytail`, else appended to the prompt parts) — an event that fires per ordinary prompt and per steering or follow-up batch as it is dequeued, and that a retry may re-enter, so the section is set per submission rather than baked once. It catches the off phrases on `input` only when the whole message is the command, a rule that came from a bug about "add a normal mode toggle"; and it records the level with `pi.appendEntry("ponytail-mode", …)` — per-session state, restored from the session's own entries on `session_start` and `session_tree`. The default comes from `PONYTAIL_DEFAULT_MODE`, else `~/.config/ponytail/config.json`, else `full`, and it shows in the status line unless `hideStatus`. omp rebinds extension factories to every subagent session and the handler never checks `ctx.agent.kind`, so a child that inherits the parent's extensions receives the section too — restricted children keep parent-loaded hooks while ambient extension discovery is off, and the doc names only `session_stop` and `cache_warming_decision` as events that never fire for task/subagent sessions. It is instructions: no second model reads output, where the advisors are that layer.

**What it says.** Smallest complete change; a decision ladder (does it need to exist → already in the codebase → platform → installed dependency → one line → minimum that works); no unasked-for abstraction or "for later" code; shortest working diff; comment only the why; grep callers before a bug fix; a check for new non-trivial logic; `shortcut:` comments. Never cut validation, error handling, security, accessibility, or what the user asked for. Levels: lite (name the smaller option), full, ultra (also question the request), plus `review`, which hands off to the ponytail-review skill.

**Finding — the repo standard, not the advisors.** Rule 6 of `docs/standards/coding.md` (the `shortcut:` format) is ponytail's bullet verbatim, and rule 5 ("The theme colour is one constant in `vite.config.ts`") is the repo's own — it is what the advisor nit that read like a taste refactor was enforcing. `Deletion beats addition` is ponytail's line: searched, it is in neither `docs/` nor AGENTS.md. No ponytail-versus-docs conflict is on record; the live risk runs the other way, that "nothing not asked for" gets read as licence to skip what a standard requires.

**Finding — every session gets the coding lens.** The section is set at each agent start, so a design or review session runs under it too: "the smallest complete change" where the work is making options or passing judgement. The mechanism also gives the lever: the level is per-session state (`off` · `lite` · `full` · `ultra` · `review`) over a configured default, so it can be switched or scoped without uninstalling anything.

**Candidate (Dan, discussed). Eject and extract.** Move the text and the skills into snippets and drop the plugin: copy the ruleset, and whichever of the six skills are used, as owned rules and skills, then `omp plugin disable ponytail@ponytail` for a trial or `omp plugin uninstall` for good.
*Fixes:* one text to own and version, scope set per project rather than by host default, and no third-party multi-host package in the harness — the cached tree carries adapters for fourteen hosts, omp loading the pi extension alone (the other thirteen: Claude Code, Codex, Cursor, Copilot, Gemini, Qoder, Kimi, Windsurf, Kiro, Devin, Grok, OpenClaw, OpenCode).
*Costs:* the mode machinery (level switching, the status line, the off phrase), the `/ponytail-*` aliases, and upstream fixes.
*Open:* eject, scope it, or leave it global?

## Thread 7 — Churn, and what the merge loses

Raised by Dan, 17 Oct: whether the commit history carries churn, keyed by story number. Dan's verdict on the pass itself, same day: "i meant looking at the squash commits was probably a bit of churn" — the question was answered, and the mining stopped there.

**What the log holds.** 41 commits on `main`; the story number leads each subject and the pull request trails as `(#N)`, so 41 commits resolve to 19 stories. Pull requests per story: twelve took one, seven took three to five — stories 20 and 16 five each, 15, 17 and 19 four, 35 and 21 three. They count pull requests, not plan lines, and lines fold: story 20's plan lists five lines, one landing as [#59](https://github.com/yearofthedan/working-title/pull/59) and three together in [#57](https://github.com/yearofthedan/working-title/pull/57) (its Plan comment). What the seven contain is mixed — 19 carries "Make the app shell installable and offline", 20 the writer driver.

**The log's churn granularity is one step too coarse.** A subject is a plan line's name, so exactly one of 41 carries a repair word ("Answer a correction by talking, and land a working change in a file", #62) and repair otherwise hides inside a pull request. Median 75% of a commit's files were already touched by an earlier commit, but every story edits the lockfile, `package.json` and lessons.md, so that figure measures shared files rather than rework. Both are kept here so neither is re-derived.

**Guidance files take the rework.** Across the seven multi-PR stories: `docs/architecture.md` 8 commits, `.agents/skills/implement/SKILL.md` 8, AGENTS.md 7, `docs/standards/testing.md` 6, `docs/dev-flow.md` 5 — and lessons.md is the same story at full width, in the 25 commits and 11 stories thread 3 already records.

**Sessions carry part of the join.** Five of the 15 session titles name a story (16, 19, 20, 35); the rest are unindexed — find-next-story, reviews, help, and two failures that each cost a session (the lockfile failure, and a reclone). A story-keyed join therefore covers part of the work and misses the overhead.

**Where the story-level churn record already lives.** The issue's Plan comment, by the flow's own design: it ticks as lines merge, names a line folded into another pull request, records a scope change after work started (#15: "Scope changed after #25 started"), and lists the work filed while building and not built (#58, #60 on story 20).

**The loss (Dan, 17 Oct).** Squash-merge keeps one commit per pull request, so a branch's own history never reaches `main`: the passes, the review-driven edits, the failed attempts and the reverts inside a pull request survive only in the pull request while it exists (its Commits tab, or the API) and in the session transcript.

**Decision to make.** Keep squash and accept that git shows nothing below the pull request; switch to rebase merges (the ruleset accepts squash only today, and the log gains a commit per branch commit); or keep squash and treat the issue's Plan comment and the pull request body as the record, which is where the flow already puts it.
*Open:* is the branch-level detail wanted at all — the log-mining path itself is declined, in Decisions.

**Considered, declined.** Reading the remaining Plan comments (16, 17, 19, 21, 35) and pulling branch commits through the GitHub API. Story 20's comment established the pattern — lines fold into one pull request, boxes tick together, and scope notes ride the issue (a reshape allowed in #20's first comment; #15's "Scope changed after #25 started") — and the open decision does not turn on more of it. The key question was never open: issue 15 is labelled `story`, its plan lines became PRs #25, #27, #28, so the leading number is the story and `(#NN)` the pull request.

## Thread 8 — The review as a skill

Asked by Dan, 17 Oct: whether this session's work is a skill or slash command.

**What the session did, as steps.** Inventory what a session loads — plugins and their extensions, hooks, context files, skills, advisors and their roster, model roles, prewalk, budgets. Verify each against its own source and the harness docs rather than its description: the plugin's `pre_llm_call`/`pre_gateway_dispatch` turned out to belong to another host, and only `pi-extension/index.js` settled what omp runs. Then measure the evidence the setup leaves — cost by agent type and model, steers and aborts, story churn from the issue's Plan comment rather than the log — and write findings into a review doc whose proposals carry discussed · agreed · parked and whose Decisions section stays honest.

**Candidate (Dan, asked 17 Oct). A `review-harness` skill**, in snippets, with a command to run it. It is the session's shape written down: inventory, verify against source, measure, record. The verification half stands on its own and is the cheaper piece — "what does this session actually load", for when a plugin or host claim needs checking.
*Status:* write the skill at the next review (Dan, 18 Oct), from this draft and that run, so nothing has to be mined from these sessions.

**Draft (agent, 17 Oct; 18 Oct lessons from threads 9–10 added) — for review; nothing placed yet.**

```markdown
---
name: review-harness
description: >
  Review the setup an agent runs in: what a session loads, what each piece really
  does, and what the sessions and the log cost. Use when the builder asks to
  review the harness, a plugin, the workflow or agent behaviour; or when a claim
  about a plugin, hook or model needs checking before it is written down.
---

# Review the harness

**Audience:** the agent. **Purpose:** how to review the setup rather than the repo, and what such a review has to carry.

## Scope first

Say what is under review — this machine's user-level setup, one project's `.omp/` and `.agents/`, one plugin, or one mechanism — and open the review doc before gathering anything. Findings land there, thread by thread, in the order the builder steers.

## Inventory what a session loads

- Config: `cfg://` — `modelRoles`, `agentModelOverrides`, `advisor`, `prewalk`, `task`, `tools.approval`, `skills`, `todo`.
- Plugins: `~/.omp/plugins/installed_plugins.json`, each manifest, and each extension entry (`package.json` `omp.extensions`, or the legacy `pi.extensions`).
- Hooks: `.omp/hooks/pre|post/*.{ts,js}` and `~/.omp/agent/hooks/pre|post/`.
- Context: AGENTS.md, skills, plan mode, compaction, advisors and their roster.
- Caps: `softRequestBudget`, `maxRuntimeMs`, `task.maxConcurrency`, goal mode.

## Before spending

- Read the user-level config before any loop of `omp -p` or any batch of agents: `advisor.enabled` starts every advisor in the roster in every `omp -p` process, from any directory, and no flag turns them off for one run. Prove one call starts no advisor — no `__advisor*` transcript in a throwaway `--session-dir`, and only the asked model answering — before running more than one.
- Estimate the cost of a batch before it runs, and check it against the first call's recorded usage before running the rest. Cache hits, thinking tokens and another model's tokenizer each moved this review's estimates by two to twenty-five times.
- Bulk work runs on the cheap model; the strong model weighs the results. Name the model and its cost to the builder before any call that draws on their Claude window.
- Run long jobs wide and in the background, and say how long they will take.

## Verify against the source, not its description

Never write down mechanics from a file you have not opened. A plugin's description is marketing and its hooks may belong to another host: omp's own events are `session_start`, `context`, `before_agent_start`, `tool_call`, `tool_result`, `turn_*`, `session_stop`. Check `omp://hooks.md`, `omp://extensions.md`, `omp://extension-loading.md` and `omp://marketplace.md` for event names, cadence and entry points, and read the adapter this host actually runs rather than the ones written for others. Anything unread is marked unverified, with the file that would settle it named beside it. A path inside a package is not loaded because it exists: list one only once a source shows the loader reading it.

## Measure the evidence

- Sessions: `~/.omp/agent/sessions/<project>/*.jsonl` — cost by agent type and model, abort and steer counts, which model ran which turn.
- The log: `git log` keyed by the story number, per `docs/standards/commits.md`. Under squash merges it shows pull requests, not passes; the story-level record is the issue's Plan comment.
- Say what a number measures, in the sentence that gives it. Pull requests per story are a floor on passes, not a count of them.

## Measure with a replay

- To compare reviewer models or briefs, replay past reviews: give a model what an advisor had been shown at one of its notes, and judge whether it raised the same problem (`omp-notes/replay.py`, `compare.py`).
- Import rules as they stood on the case's date, so a rule written after an incident cannot leak into its replay.
- One run per case is noise: the same brief caught four of nine, then six. Compare runs, and read which cases flip, before reading a gap between numbers.
- A replay measures recall of what the original reviewer caught, under cut context and without the reviewer's tools; it compares models, it does not measure what they would catch live.

## Get an independent view

When a design question has been argued in the conversation, give it to a cheap subagent with the workflow and the repo's rules but not the conversation's framing, the cases or the agent's own answer, and ask it to cite a file for every claim. Report where its answer differs, and where the prompt still carried framing.

## Record it

- One doc, one thread per topic, findings before proposals; every finding names the source it came from.
- Proposals carry discussed · agreed · parked; un-discussed candidates stay in the conversation.
- Decisions stay honest, and anything declined or dropped is named with who said so.
- Remove what is finished rather than annotating it.

## What it does not do

It changes nothing — no config edits, no installs, no code. Findings and options only, until the builder says which.
```

## Thread 9 — Reviewer models, replayed (18 Oct)

**The advisor incident.** `advisor.enabled: true` in `~/.omp/agent/config.yml`, with the user-level roster in `~/.omp/agent/WATCHDOG.yml`, starts both Opus reviewers in every `omp -p` process, from any directory; OMP has no flag to turn them off for one run. A replay loop through `omp -p` therefore started two Opus reviewers per call and took Dan's Opus window from 12% to 98%. `advisor.enabled` is now `false`. `omp-notes/replay.py` aborts a run if an advisor transcript appears or a model other than the one asked for answers, runs one call at a time, and stops at a `replay/STOP` file.

**The replay.** `omp-notes/replay.py` gives a model what an advisor had been shown up to one of its past notes, behind OMP's real advisor prompt (`replay/adviser-system.txt`, from `/advisor dump raw`), and a DeepSeek judge says whether the model raised the same problem. Method and limits are in `omp-notes/README.md`. Cases: all 16 blockers and 20 seeded concerns, at 150k characters of recent session.

| Opus's original note | Cases | DeepSeek Flash | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- | --- |
| Blockers a git/`gh` guard would stop | 7 | 5 same, 1 partial | not run | not run |
| Blockers needing judgement | 9 | 3 same, 1 partial | 2 same; `NONE` on 5 | run on the 5 both others missed: 1 same, 2 partial |
| Concerns | 20 | 4 same, 3 partial | not run | not run |

Cost: DeepSeek $0.55, Sonnet $2.18, Opus $2.72, as recorded. Each case ran once.

**Read.** A cheap model catches the mechanical class, which a hook can stop for free. On judgement it misses most, and Sonnet did no better than DeepSeek. The replay understates every model — Opus caught all five of its hard cases live and three, at least in part, replayed — so it compares models rather than measuring recall. The evidence does not support moving the judgement reviewers off Opus.

**Three blockers read in their sessions.**
- 400 (#33): after "it's ready", the agent probed pnpm in `/tmp` for nine minutes, and a stub server it wrote became the test harness. The implement skill has no step for answering a story's open questions before proposing its pull requests. Filed as #74.
- 337 (#62): the blocker fired on reads after "merged"; the real overstep came six minutes later, when "here we'll just improve the story skill" was taken as a go and Dan answered "NO". This is #67's rule.
- 610 (#63, #66): asked for a prose review, the agent also marked both pull requests ready, with cells citing runs that never ran on that commit and a claim that proved wrong. The run part is in #73.

**What the advisors are told and given.** OMP's built-in prompt says "NEVER tell agent to seek clarification, confirm scope", against this repo's consent rules. They read the whole transcript at every review, with `read`, `grep` and `glob` and "2–3 tool calls" per note; the final reviewer is told to read the diff but has no tool that can. The repo's rule files together are about 12k tokens.

**Filed.** #73 (refuse a restore over uncommitted work, and `./do ready` for the hand-over), #74 (probe a story's open questions before proposing its pull requests), and #67 updated. All three sit under #13.

## Thread 10 — Narrow reviewers and the build workflow (18 Oct)

**First narrow-brief run.** `replay.py --brief` swaps the roster's instructions for a brief: a one-line job plus rule files imported as they stood on `main` on each case's date, so rules written after an incident cannot leak into its replay. Three briefs (consent, evidence, plan order) ran on the nine judgement blockers, with a second run of the broad brief.

| | Broad, run 1 | Broad, run 2 | Any of the three narrow briefs |
| --- | --- | --- | --- |
| Caught, of 9 | 4 | 6 | 7 |
| Caught, of the 5 both earlier cheap runs missed | 0 | 2 | 3 (Opus replayed: 3) |
| Cost per case | about $0.015 | about $0.015 | about $0.044 for all three (Opus: about $0.54) |

The broad brief's swing from 4 to 6 is as large as the model gaps thread 9 reported, so single runs only show direction. The narrow set missed 171, whose evidence existed but could not have come out otherwise, and 337, the clearest consent case; OMP's built-in advisor prompt is the untested suspect there.

**Evidence blockers read in their sessions.** 171: a headless run copied the agent's own drafts from a pull request body, and was reported as independent evidence. 827: a probe's grep matched the hook's own command text, which invalidated the whole `./do add` guard. 813: smoke runs from before a merge were claimed for the merged head, where `./do add` refused every add. 813 is mostly #73's rule that a cited run be on the head commit; 171 and 827 are the `lessons.md` row "A run is only evidence if the answer is not already written where the run can read it", which nothing checks.

**Weaver.** Weaver's `slice` skill, `spec` skill and `execution-agent` already split the work: the main session settles decisions and dispatches acceptance criteria to an execution agent, reads its notes file rather than its summary, and reviews each batch's diff. Its OMP-specific parts came late (Dan) and are treated as untested; the executor's frontmatter model is stale, since the user-level override routes it to DeepSeek.

**A less-primed breakdown.** A DeepSeek task agent, given the workflow and the repo's rules but not the cases or the earlier briefs, proposed four live remits for the executor: R1 evidence (each claim that something ran against the tool result that shows it, and runs that could not have failed), R2 approach guard (a write that leaves the brief's approach or file list), R3 unchecked claim (a claim about a tool, the platform or the repo's rules with no doc or run behind it; `lessons.md`'s eight-PR row), R4 case check (a test that cannot fail, or one a tool's default already satisfies). It left consent to the main session: the executor never talks to the builder and cannot publish. R3 checks cited sources and does not research uncited claims; mid-build research means the approach is in doubt, which is the main session's.

**R1–R4 on all 36 cases.** One run each, DeepSeek, at 150k characters.

| | Broad (roster) | R1 evidence | R3 claims | R1+R3 merged | R4 cases | R1, R3, R4 together |
| --- | --- | --- | --- | --- | --- | --- |
| Blockers caught, of 16 | 10 | 7 | 4 | 7 | 5 | 9 |
| Concerns caught, of 20 | 7 | 2 | 4 | 9 | 2 | 8 |
| Notes per case | 1.4 | 0.7 | 1.0 | 1.1 | 0.6 | 2.3 |
| Cost for 36 cases | $0.53 | $0.54 | $0.51 | $0.46 | $0.52 | $1.57 |

**Read.** No narrow brief beat the single broad one on blockers, and three narrow reviewers together cost three times as much for a similar haul. The merged claims reviewer caught the most concerns, the one class where it led, at the lowest cost. On the seven blockers the executor would still face once #73's hook and the main session's consent rules take the rest (36, 171, 355, 361, 400, 813, 827), the broad brief caught four and the three narrow briefs together four. Nothing caught 171, 337 or 507. The broad brief's swing from 4 to 6 on nine cases puts these differences inside the noise. R2 cannot be replayed, since no past session had a brief; it gets a live trial once #75 lands.

## Proposal: the build workflow (being shaped)

| Step | Who | Model | Where it is |
| --- | --- | --- | --- |
| Write and agree the story; the how stays out of it | `writing-stories`, main session; Dan adds `ready` | Opus | unchanged |
| Plan: read the issue, probe its open questions, propose the planned pull requests | `implement`, main session | Opus | #74 |
| Per planned pull request: confirm the approach with Dan (the default; automated later) | main session | Opus | #54, renamed in #75 |
| Open the branch and the draft pull request with the dispatch brief in its body: criteria, approach, files, interface, where each test lands | main session | Opus | #75 |
| Build, test, commit, push to that branch only; write notes as it goes; stop and return when what to build or the approach is in doubt; never publish | `execution-agent` | DeepSeek | #75; push rule in #73 |
| Live review of the build | one reviewer, the broad roster brief; on the executor, "contradicts what the run was asked to do" reads as leaving the dispatch brief | DeepSeek | decided for now; a remit moves to a stronger model only on live evidence |
| Read the notes into `Decisions` and `Learned`; found work into issues on Dan's go | main session | Opus | #75 |
| Review the pull request's diff against `main` | `reviewer` agent, run by the main session | Opus | existing hand-over step |
| Hand over | `./do ready`, behind the hook | — | #73 |
| Name the model and role on every commit and pull request | trailers and "Written with" | — | #76 |
| Keep per-turn rules in force | `.omp/RULES.md` | — | #67 |

Still to shape:
- Where the executor's notes live, with `task.isolation.enabled` on.
- Whether a hook can tell the main session from the executor, which the executor's `gh` refusals depend on.
- Whether the executor may browse; weaver's may not.
- Later: batches within a planned pull request, and settling every approach when the plan is agreed.

## Next steps

- **Build the working-title issues** — #73 first; #76 alongside if wanted; #74 before #75; #67 any time; #75 last. Each needs Dan's `ready`.
- **Spawn-policy hook** — thread 1, harness: a user-level `before_subagent_spawn` hook in `~/.omp/agent/hooks/`, source in snippets, that refuses a batch of more than 4 and an Opus pin on `scout`, `seance` or `task`, telling the agent to ask the builder. Test it against thread 1's nine-agent call.
- **One before-and-after comparison** once #75 has built a few pull requests: cost per merged pull request (`omp stats` over the window, divided by pull requests merged in it) and steers and aborts per session (`notes.py behaviour`). No standing process until that shows one is needed.
- **Replay the end-of-pull-request review** after #75's first pull requests, with DeepSeek, Sonnet and Opus arms, on script-built input (diff, issue, rule files). Sonnet is the likeliest: the input is fixed and the job well-scoped. Past Opus review subagents recorded $1–6 each.
- **Upgrade a remit on live evidence** — thread 10: once #75 runs, read which of the live reviewer's misses cost rework; test a stronger model on that remit's cases before changing it.
- **Lessons rows: check or rule-only** — thread 3, after #73 lands, on DeepSeek: sort the rows with no tripwire, and for each matching reviewer note, check whether the row's tripwire was in place before it. The rows that sort to "check" are the next tasks.
- **Write the harness-review skill at the next review** — thread 8's draft, with thread 9–10's lessons, plus what that review teaches.

## Decisions

- **Log mining for churn** — declined (Dan, 17 Oct): "looking at the squash commits was probably a bit of churn". The story-level record is the issue's Plan comment; thread 7 keeps the counts the pass produced.
- **Harness-review skill** — Dan, 18 Oct: written at the next review, from thread 8's draft and that run.
- **Advisors off by default** — Dan, 18 Oct: `advisor.enabled: false` at user level; Dan turns them on per build session.
- **Unnamed subagents on DeepSeek** — Dan, 18 Oct: `task`, `scout` and `sonic` set to `@smol` in `task.agentModelOverrides`; `reviewer` stays on Opus.
- **A precommit check for the plan comment** — dropped (Dan, 18 Oct): case 400 made no commit, and Dan wanted to understand how it happened before constraining it.
- **A confirm prompt before publishing** — dropped (agent, 18 Oct): neither 337 nor 610 would have been stopped by it.
- **Builds split between a main session and an execution agent** — Dan, 18 Oct: Opus plans, settles the approach and hands over; DeepSeek builds one planned pull request per run. #75.
- **The how stays out of stories** — Dan, 18 Oct: it goes in the dispatch brief, recorded in the pull request body.
- **"Approach", confirmed by default** — Dan, 18 Oct: replaces "calls"; Dan confirms each planned pull request's approach; automation comes later.
- **Branch, pull request and publishing stay with the main session** — Dan, 18 Oct: the executor commits and pushes to its branch only.
- **Executor notes go to the pull request body** — Dan, 18 Oct: via the main session, into `Decisions` and `Learned`.
- **Provenance on commits and pull requests** — Dan, 18 Oct: `Agent-Model` and `Agent-Role` trailers, roles in "Written with". #76.
- **Live reviewer candidates R1–R4, consent left to the main session** — Dan, 18 Oct: candidates, not yet adopted. Thread 10's replay favours one reviewer over several.
- **R3 checks cited sources and does not research** — agent, 18 Oct, at Dan's delegation.
- **One live reviewer on the executor, with the broad brief** — Dan, 18 Oct, for now: one DeepSeek reviewer with the roster's broad brief, and the end-of-pull-request review on Opus kept. It caught 10 of 16 blockers against the merged claims brief's 7, and 4 of the 7 left to the executor against 3; the agent first picked the merged brief on its concern count and was corrected. The repeats were not run.
- **Escalation without Dan** — closed (Dan, 18 Oct): an executor's stop goes to the Opus main session, which #75 already does; an approach change waits for Dan until the autonomy step.
- **Spawn guard** — Dan, 18 Oct: `seance` set to `@smol` in `task.agentModelOverrides` (whether it beats seance's source-model inheritance is unverified), and the spawn-policy hook in Next steps, with batches of up to 4 allowed.
- **Measures** — Dan, 18 Oct: one before-and-after comparison once #75 has built a few pull requests, with no new tooling.
- **The pull request review bench waits for #75** — Dan, 18 Oct: the review it measures changes shape with #75, and several changes land together.
- **Threads 2, 5 and "extract → analyse" closed** — Dan, 18 Oct: #73 is the first check-shaped catch made a check, ledger sittings gave way to the comparison, pairing and communication go to #67 and that comparison, and `notes.py` already extracts. Thread 2's "executor improvement, and dev sessions cut into batches" candidate became #75: a fresh executor per planned pull request.
- **Ponytail parked** — Dan, 18 Oct: left installed at `full`, turned off per session when it gets in the way. Under #75 the executor inherits it too.
- **Squash merges kept** — Dan, 18 Oct: the pull request body is the record; #76 raises the trailers question when built.

## How these numbers were got

So a later reader can re-derive them or find a disagreement, and can see what each leaves out.

- **Costs, notes and their aftermath** (thread 2) — `omp-notes/notes.py`: `extract` walks `~/.omp/agent/sessions/<project>/` — the main transcript for delivered notes, each session's top-level artifacts for recorded costs — into `notes.jsonl` and `sessions.jsonl`; `report` prints counts by advisor and severity, the classified mix, and session costs. The tool states its own limits: nested subagent artifact directories are not walked, costs are as the transcripts record them, delivered notes only (advisor-side attempts live in each session's `__advisor.*.jsonl`).
- **Steers and aborts** (thread 5) — `notes.py behaviour --project working-title`: a steer is a user message carrying `"steering": true`; a reply cut off carries `stopReason: "aborted"`, split by its `errorMessage`. As run on 17 Oct: **154 steers in 11 of 15 sessions**, and **70 aborted replies** — 65 `Interrupted by user`, 4 `Request was aborted` (they follow `session_exit`, the session closing, not friction), one uncategorised — so the friction figure thread 5 uses is the 65. The same run prints each session's title, which thread 7's join reads. Every figure here is a snapshot: the earlier 152 steers, 66 aborts and 14 sessions are the same measures at an earlier moment.
- **Commits, stories and pull requests** (thread 7) — `git log --name-only --date=short --pretty=format:'C|%h|%ad|%s'`; the story key is the leading `N:` and the pull request the trailing `(#N)`, files per commit from `--name-only`. It counts commits and pull requests, never plan lines.
- **What a figure cannot show** is said where the figure is given: pull requests are a floor on passes, the median-of-files number measures shared files rather than rework, and the repair-word count covers subjects only.

The ledger's data stays local by design — `omp-notes/.gitignore` excludes the extracted files, and its README repeats that the tool belongs in the repo and the session data does not. This document is local too: nothing here is committed yet.
