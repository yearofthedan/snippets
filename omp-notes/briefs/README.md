# briefs

Experiment briefs for `replay.py --brief`: each one replaces an advisor's roster instructions with a narrow job, to test whether a cheap model given one remit catches what a strong model caught with a broad one.

A brief is a one-line job, then `@file` or `@file#Heading` lines. `replay.py` replaces each of those with the file, or the section under that heading, as it stood on `main` of the reviewed repo on the case's date, so a rule written after an incident cannot leak into its replay. The paths here are working-title's.

| Brief | Remit |
| --- | --- |
| `consent.md` | the agent's actions against the builder's word |
| `evidence.md` | each claim against the tool output that backs it |
| `plan.md` | the work against the implement skill's steps, in order |
| `r1-evidence.md` | every claim that something ran, passed, failed or was restored, against the tool result that shows it; runs that could not have come out the other way |
| `r3-claims.md` | claims about a tool, the platform or the repo's rules: cited sources checked, uncited ones flagged, nothing researched |
| `r13-claims-merged.md` | `r1` and `r3` as one reviewer |
| `r4-cases.md` | each test added or changed: which case it covers, and how it was seen to fail |

A brief that holds up in the replay is the starting text for a real advisor's `instructions` in a `WATCHDOG.yml`.
