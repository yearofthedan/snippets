# omp-notes

A ledger of advisor notes read from OMP session transcripts, with the run's next messages after each — so "what did the reviewers catch, and what happened next" is data instead of a fresh investigation.

## Use

```sh
python3 notes.py extract --project working-title   # -> notes.jsonl + sessions.jsonl
python3 notes.py report                            # counts by advisor/severity; mix once classified; session costs
python3 notes.py review --limit 20                 # unclassified notes with aftermath, for a sitting
python3 notes.py behaviour --project working-title # steers and aborts per session, from the transcripts
```

`extract` walks `~/.omp/agent/sessions/<project>/`: the main transcript (delivered notes) and each session's top-level artifacts (costs). `--project SUBSTR` and `--since YYYY-MM-DD` narrow the window; any project works. Omitting `--project` extracts every project in the store, worktrees included.

Each row carries empty `class`, `sub`, `outcome`, `checkable`, `surface`, `lesson`, `defect` columns. Classification is judgement, not extraction: a periodic sitting fills them in — `review` shows what is left — and `report` then prints the mix. Classes used so far: `error` (the executor's own mistake), `judgement`, `guidance-defect`, `taste`, `self-correction`. Outcomes: `actioned`, `reasoned`, `silent`. `surface` records where the issue would have surfaced had the reviewer stayed silent: `self` (the run trips over it on its own next step — a mechanical failure), `check` (a script or CI), `builder` (human at handover), `nobody` (only an independent reader gets it). `lesson` names the `docs/lessons.md` row the note matches, when it catches one — free text, since rows carry no id.

The extracted data files are gitignored: the tool belongs in the repo, the session data does not.

## Replay

`replay.py` replays past advisor reviews on another model, to measure whether a cheaper reviewer raises what the original did:

```sh
python3 replay.py cases                       # every blocker + 20 seeded concerns -> replay/cases.jsonl
python3 replay.py run   --model <model>       # -> replay/<model>.jsonl
python3 replay.py judge --model <model>       # same / partial / none per case, judged by DeepSeek Flash
python3 replay.py report -v
```

Safety: every call keeps its session in a throwaway directory, and the run aborts if an advisor transcript appears there or a model other than `--model` answers. `advisor.enabled: true` in the user config starts advisors in every `omp -p` process, Opus ones included. Runs are serial by default (`--workers 1`). `touch replay/STOP` makes the next replay call abort; delete it to run again.

`--brief briefs/<name>.md` replaces the roster's instructions with a brief: plain lines are kept, and an `@file` or `@file#Heading` line is replaced by that file or section as it stood on `main` on the case's date, so rules written after an incident cannot leak into its replay. The briefs and what each one tests are in [briefs/README.md](./briefs/README.md). `python3 compare.py <tag> … --union <tag,…>` prints each case's result per run, catches by severity, a union, notes per case and cost.

Everything under `replay/` is gitignored: the cases and results are session data, and `adviser-system.txt` is OMP's advisor prompt with the reviewed repo's `AGENTS.md` inside it.

Each case gets the session updates its advisor had been shown up to that review, AGENTS.md as it stood on `main` at the time, and the roster's instructions, behind OMP's own advisor prompt taken from `replay/adviser-system.txt` — the output of `/advisor dump raw` in a fresh session (`--system-file`; without it a short stand-in is used). Models run through `omp -p` with tools, extensions, skills and rules off, so OMP's stored credentials are used; `--tag` keeps runs with different settings apart. Fidelity limits: the dumped prompt is today's OMP version, not the one each review ran under; the replay has no workspace tools, where some original reviews read files (`reads` in the report); older updates past `--tail-chars` are cut; the advisor's own earlier replies are left out. It measures recall of known catches, not what the original missed.

## Limits

- Nested subagent artifact directories are not walked; top level only.
- Costs are the transcripts' recorded values.
- Delivered notes only. The advisor-side attempts (and their delivery outcomes) live in each session's `__advisor.*.jsonl` if a question needs them.
