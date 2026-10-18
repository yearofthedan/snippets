#!/usr/bin/env python3
"""Replay past advisor reviews on another model.

Each case is one `advise` call an advisor made. The replay gives a candidate
model what that advisor had been shown up to that review (the session-update
deltas, without the advisor's own earlier replies), and asks for notes. A judge
then says whether any replayed note names the same problem as the original.

  cases   pick the cases: every blocker plus a seeded sample of concerns
  run     replay the cases on a model           -> replay/<model>[@tag].jsonl
  judge   compare replayed notes with originals -> replay/<model>[@tag].judged.jsonl
  report  recall and cost per model

Models run through `omp -p` with tools, extensions, skills and rules off, from
an empty directory, so OMP's stored credentials are used and no repo context
leaks in. The project context is AGENTS.md as it stood on `main` at the time
of the review, with its @imports expanded from the same commit.
"""
import argparse, concurrent.futures, glob, json, os, random, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "replay")
STORE = os.path.expanduser("~/.omp/agent/sessions")
WATCHDOG = os.path.expanduser("~/.omp/agent/WATCHDOG.yml")
JUDGE = "openrouter/deepseek/deepseek-v4.1-flash"

# Used only when no dump of OMP's advisor prompt is supplied (--system-file).
FALLBACK_BASE = """You review a coding agent's session as it runs. You see the session as
updates: the user's messages, the agent's reasoning, its tool calls and their results.

- nit: cleanup, simplification, low-risk edge cases.
- concern: material risk, likely wrong direction, missing constraint, invented API.
- blocker: continuing would clearly waste work or produce broken output.

At most four non-blocker notes per update."""

# Replaces the `advise` tool: the replay runs without tools.
OUTPUT = """This is a replay without tools: judge from the session updates alone. Instead of
calling `advise`, write each note as one JSON object per line and nothing else:
{"severity": "nit" | "concern" | "blocker", "note": "<one concrete piece of advice>"}

Judge the latest update; earlier updates are context. If there is nothing to report,
reply with the single word NONE."""

PROJECT_PREAMBLE = ("Context files: user's standing project instructions (AGENTS.md etc.); binding on "
                    "driving agent. Enforce; flag drift immediately; NEVER advise against mandates.")

JUDGE_PROMPT = """An original reviewer raised the note below. A second reviewer, shown the
same session, raised the candidate notes. Decide whether any candidate names the same
underlying problem: same defect, same place or action. Different wording is fine;
a vaguer note pointing at the same problem is "partial".

Reply with one JSON object and nothing else:
{"match": "same" | "partial" | "none", "which": <candidate index or null>, "why": "<one sentence>"}"""


def slug(model):
    return re.sub(r"[^a-z0-9.]+", "-", model.lower()).strip("-")


def jsonl(path):
    return [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def text(content):
    if isinstance(content, str):
        return content
    return "".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")


def advisor_name(path):
    m = re.match(r"__advisor\.?(.*)\.jsonl$", os.path.basename(path))
    return m.group(1) or "default"


def watchdog_instructions(name):
    """Shared and per-advisor `instructions: |` blocks from the user-level roster, as they read today.

    shortcut: reads only `- name:` and `instructions: |` block scalars, the shape this roster uses;
    a roster using other YAML forms needs a real parser."""
    if not os.path.exists(WATCHDOG):
        return ""
    lines = open(WATCHDOG, encoding="utf-8").read().splitlines()
    parts, current = [], None
    for i, line in enumerate(lines):
        m = re.match(r"^\s*- name:\s*(.+)$", line)
        if m:
            current = slug(m.group(1))
        m = re.match(r"^(\s*)instructions:\s*\|\s*$", line)
        if not m:
            continue
        indent, block = len(m.group(1)), []
        for nxt in lines[i + 1:]:
            if nxt.strip() and len(nxt) - len(nxt.lstrip()) <= indent:
                break
            block.append(nxt.strip())
        if indent == 0 or current == name:
            parts.append("\n".join(block).strip())
    return "\n\n".join(p for p in parts if p)


def agents_md_at(repo, ts):
    """AGENTS.md on main as of `ts`, @imports expanded from the same commit."""
    sha = subprocess.run(["git", "-C", repo, "rev-list", "-1", f"--before={ts}", "main"],
                         capture_output=True, text=True).stdout.strip()
    if not sha:
        return "", ""

    def show(path):
        r = subprocess.run(["git", "-C", repo, "show", f"{sha}:{path}"], capture_output=True, text=True)
        return r.stdout if r.returncode == 0 else ""

    lines = []
    for line in show("AGENTS.md").splitlines():
        m = re.match(r"^@(\S+)$", line.strip())
        lines.append(show(m.group(1)) if m else line)
    return sha[:8], "\n".join(lines)


def cmd_cases(a):
    rows = []
    for f in sorted(glob.glob(os.path.join(STORE, a.project_dir, "*", "__advisor*.jsonl"))):
        ents = [e for e in jsonl(f) if e.get("type") == "message"]
        reads = 0  # investigative tool calls since the last session update, i.e. within this review
        for i, e in enumerate(ents):
            m = e["message"]
            if m["role"] == "user":
                reads = 0
            if m["role"] != "assistant":
                continue
            reads += sum(1 for c in m.get("content", []) if c.get("type") == "toolCall" and c["name"] != "advise")
            for c in m.get("content", []):
                if c.get("type") == "toolCall" and c["name"] == "advise":
                    args = c.get("arguments", {})
                    rows.append({
                        "id": f"{os.path.basename(os.path.dirname(f))[:19]}/{advisor_name(f)}/{i}",
                        "file": f, "pos": i, "ts": e.get("timestamp"), "advisor": advisor_name(f),
                        "severity": args.get("severity", "nit"), "note": args.get("note", ""),
                        "reads": reads, "model": m.get("model"),
                    })
    blockers = [r for r in rows if r["severity"] == "blocker"]
    concerns = [r for r in rows if r["severity"] == "concern"]
    random.Random(a.seed).shuffle(concerns)
    picked = blockers + concerns[: a.concerns]
    write_jsonl(os.path.join(OUT, "cases.jsonl"), picked)
    print(f"{len(rows)} advise calls; picked {len(blockers)} blockers + {min(a.concerns, len(concerns))} concerns")
    print(f"{sum(1 for r in picked if r['reads'])} of {len(picked)} used workspace reads in the review that raised them")


def build_input(case, a):
    ents = [e for e in jsonl(case["file"]) if e.get("type") == "message"]
    deltas = [text(e["message"]["content"]) for e in ents[: case["pos"]] if e["message"]["role"] == "user"]
    first, rest = deltas[0], "\n\n".join(deltas[1:])
    head = first[: a.head_chars]
    tail = rest[-a.tail_chars:]
    cut = len(rest) - len(tail)
    body = head
    if cut > 0:
        body += f"\n\n[... {cut} characters of earlier session updates omitted ...]\n\n"
    else:
        body += "\n\n"
    return body + tail


STOP = os.path.join(OUT, "STOP")


class Abort(Exception):
    """Stops the whole run: an advisor started (it bills its own model, usually Opus), another
    model answered, or `replay/STOP` exists."""


def omp_call_allowed():
    if os.path.exists(STOP):
        raise Abort(f"{STOP} exists; delete it to run")


def omp(model, system, prompt, timeout):
    # The session is kept in a throwaway dir only so an advisor transcript would show up there:
    # `advisor.enabled` in user config starts advisors in every `omp -p` process.
    with tempfile.TemporaryDirectory() as cwd, tempfile.TemporaryDirectory() as sessions, \
            tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as sf:
        sf.write(system)
        sf.flush()
        cmd = ["omp", "-p", "--session-dir", sessions, "--no-tools", "--no-extensions", "--no-skills",
               "--no-rules", "--no-title", "--max-time", f"{timeout}s", "--model", model,
               "--system-prompt", sf.name, "--mode", "json"]
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, cwd=cwd)
        advisors = glob.glob(os.path.join(sessions, "**", "__advisor*"), recursive=True)
    os.unlink(sf.name)
    if advisors:
        raise Abort(f"advisor transcript written: {[os.path.basename(p) for p in advisors]}")
    reply, usage, models = None, None, set()
    for line in r.stdout.splitlines():
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "message_end" and ev["message"].get("role") == "assistant":
            reply, usage = text(ev["message"].get("content", [])), ev["message"].get("usage")
            models.add(ev["message"].get("model"))
    if reply is None:
        raise RuntimeError(f"omp exit {r.returncode}: {r.stderr[-400:]}")
    if not all(m and m.split("/")[-1] == model.split("/")[-1].split(":")[0] for m in models):
        raise Abort(f"asked for {model}, answered by {sorted(map(str, models))}")
    return reply, usage


def parse_notes(reply):
    notes = []
    for line in reply.splitlines():
        line = line.strip().strip("`")
        if line.startswith("{"):
            try:
                n = json.loads(line)
                if n.get("note"):
                    notes.append({"severity": n.get("severity", "nit"), "note": n["note"]})
            except json.JSONDecodeError:
                pass
    return notes


def base_prompt(path):
    """Block 1 of the first advisor in an `/advisor dump raw` file: OMP's own advisor prompt,
    shared by every roster entry. Falls back to a short stand-in when no dump exists."""
    if not path or not os.path.exists(path):
        return FALLBACK_BASE
    dump = open(path, encoding="utf-8").read()
    m = re.search(r"### System Prompt 1\n(.*?)\n### System Prompt 2", dump, re.S)
    if not m:
        sys.exit(f"{path}: no '### System Prompt 1' block; is it an /advisor dump raw?")
    return m.group(1).strip()


def section(text, heading):
    """A markdown section from its heading to the next heading of the same or a higher level."""
    lines, out, level = text.splitlines(), [], None
    for line in lines:
        m = re.match(r"^(#+)\s+(.*)$", line)
        if level is None:
            if m and m.group(2).strip() == heading:
                level, out = len(m.group(1)), [line]
            continue
        if m and len(m.group(1)) <= level:
            break
        out.append(line)
    return "\n".join(out).strip()


def brief_at(path, repo, ts):
    """A brief file: plain lines kept, `@file` or `@file#Heading` lines replaced by that file (or
    section) as it stood on main at `ts`, so rules written after the reviewed moment cannot leak in."""
    sha = subprocess.run(["git", "-C", repo, "rev-list", "-1", f"--before={ts}", "main"],
                         capture_output=True, text=True).stdout.strip()
    out = []
    for line in open(path, encoding="utf-8").read().splitlines():
        m = re.match(r"^@([^#\s]+)(?:#(.+))?$", line.strip())
        if not m:
            out.append(line)
            continue
        r = subprocess.run(["git", "-C", repo, "show", f"{sha}:{m.group(1)}"], capture_output=True, text=True)
        text = r.stdout if r.returncode == 0 and sha else ""
        if m.group(2):
            text = section(text, m.group(2).strip())
        out.append(text or f"[{line.strip()} did not exist on {ts[:10]}]")
    return "\n".join(out).strip()


def replay_one(case, a):
    omp_call_allowed()
    # Same order as OMP builds it: base prompt, project context, shared and per-advisor instructions.
    _, agents = agents_md_at(a.repo, case["ts"])
    parts = [base_prompt(a.system_file)]
    if agents:
        parts.append(f'<project-context>\n{PROJECT_PREAMBLE}\n<file path="AGENTS.md">\n{agents}\n</file>\n</project-context>')
    wd = brief_at(a.brief, a.repo, case["ts"]) if a.brief else watchdog_instructions(case["advisor"])
    if wd:
        parts.append(wd)
    parts.append(OUTPUT)
    reply, usage = omp(a.model, "\n\n".join(parts), build_input(case, a), a.timeout)
    return {"id": case["id"], "model": a.model, "notes": parse_notes(reply), "raw": reply, "usage": usage}


def run_name(a):
    return slug(a.model) + (f"@{a.tag}" if a.tag else "")


def pool(fn, items, workers):
    out, errors = [], 0
    with concurrent.futures.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(fn, it): it for it in items}
        for fut in concurrent.futures.as_completed(futs):
            try:
                out.append(fut.result())
            except Abort:
                for f in futs:
                    f.cancel()
                raise
            except Exception as e:  # one failed case must not sink the batch
                errors += 1
                print(f"failed {futs[fut]['id']}: {e}", file=sys.stderr)
    return out, errors


def selected_cases(a):
    cases = jsonl(os.path.join(OUT, "cases.jsonl"))
    if a.ids:
        want = set(a.ids.split(","))
        cases = [c for c in cases if c["id"] in want]
    return cases[: a.limit] if a.limit else cases


def cmd_run(a):
    cases = selected_cases(a)
    rows, errors = pool(lambda c: replay_one(c, a), cases, a.workers)
    path = os.path.join(OUT, run_name(a) + ".jsonl")
    old = {r["id"]: r for r in jsonl(path)} if os.path.exists(path) else {}
    old.update({r["id"]: r for r in rows})
    write_jsonl(path, old.values())
    cost = sum((r["usage"] or {}).get("cost", {}).get("total", 0) for r in rows)
    print(f"replayed {len(rows)} cases on {a.model}, {errors} failed, ${cost:.4f} -> {path}")


def judge_one(case, result, a):
    if not result["notes"]:
        return {"id": case["id"], "match": "none", "which": None, "why": "no notes raised", "usage": None}
    cands = "\n".join(f"[{i}] ({n['severity']}) {n['note']}" for i, n in enumerate(result["notes"]))
    prompt = f"Original note ({case['severity']}):\n{case['note']}\n\nCandidate notes:\n{cands}"
    reply, usage = omp(a.judge, JUDGE_PROMPT, prompt, a.timeout)
    m = re.search(r"\{.*\}", reply, re.S)
    verdict = json.loads(m.group(0)) if m else {"match": "none", "which": None, "why": "unparseable: " + reply[:200]}
    return {"id": case["id"], **verdict, "usage": usage}


def cmd_judge(a):
    cases = {c["id"]: c for c in jsonl(os.path.join(OUT, "cases.jsonl"))}
    results = jsonl(os.path.join(OUT, run_name(a) + ".jsonl"))
    rows, errors = pool(lambda r: judge_one(cases[r["id"]], r, a), [r for r in results if r["id"] in cases], a.workers)
    path = os.path.join(OUT, run_name(a) + ".judged.jsonl")
    write_jsonl(path, rows)
    print(f"judged {len(rows)}, {errors} failed -> {path}")


def cmd_report(a):
    cases = {c["id"]: c for c in jsonl(os.path.join(OUT, "cases.jsonl"))}
    for path in sorted(glob.glob(os.path.join(OUT, "*.judged.jsonl"))):
        model = os.path.basename(path)[: -len(".judged.jsonl")]
        judged = {j["id"]: j for j in jsonl(path)}
        results = {r["id"]: r for r in jsonl(os.path.join(OUT, model + ".jsonl"))}
        cost = sum((r["usage"] or {}).get("cost", {}).get("total", 0) for r in results.values())
        print(f"\n{model}  replay ${cost:.4f}")
        for sev in ("blocker", "concern"):
            ids = [i for i in judged if cases.get(i, {}).get("severity") == sev]
            if not ids:
                continue
            same = sum(judged[i]["match"] == "same" for i in ids)
            part = sum(judged[i]["match"] == "partial" for i in ids)
            extra = sum(len(results[i]["notes"]) for i in ids if i in results) / len(ids)
            print(f"  {sev:8} {len(ids):3}  same {same}  partial {part}  missed {len(ids) - same - part}"
                  f"  notes/case {extra:.1f}")
        if a.verbose:
            for i, j in sorted(judged.items()):
                c = cases[i]
                print(f"  {j['match']:7} {c['severity']:8} {i}  reads={c['reads']}  {j.get('why', '')[:140]}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(required=True)
    c = sub.add_parser("cases")
    c.add_argument("--project-dir", default="-Projects-working-title")
    c.add_argument("--concerns", type=int, default=20)
    c.add_argument("--seed", type=int, default=1)
    c.set_defaults(fn=cmd_cases)
    for name, fn in (("run", cmd_run), ("judge", cmd_judge)):
        s = sub.add_parser(name)
        s.add_argument("--model", required=True)
        s.add_argument("--judge", default=JUDGE)
        s.add_argument("--repo", default=os.path.expanduser("~/Projects/working-title"))
        s.add_argument("--ids", help="comma-separated case ids")
        s.add_argument("--tag", default="", help="suffix that keeps runs with different settings apart")
        s.add_argument("--brief", help="replaces the roster instructions; @file#Heading lines resolve as of each case")
        s.add_argument("--system-file", default=os.path.join(OUT, "adviser-system.txt"),
                       help="an /advisor dump raw; missing -> a short stand-in prompt")
        s.add_argument("--limit", type=int)
        s.add_argument("--workers", type=int, default=1)
        s.add_argument("--timeout", type=int, default=300)
        s.add_argument("--head-chars", type=int, default=20_000, help="kept from the session's first update")
        s.add_argument("--tail-chars", type=int, default=400_000, help="kept from the most recent updates")
        s.set_defaults(fn=fn)
    r = sub.add_parser("report")
    r.add_argument("-v", "--verbose", action="store_true")
    r.set_defaults(fn=cmd_report)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
