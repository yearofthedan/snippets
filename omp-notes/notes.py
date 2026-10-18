#!/usr/bin/env python3
"""OMP advisor-notes ledger.

extract  delivered advisor notes from session transcripts -> notes.jsonl
         per-session recorded costs -> sessions.jsonl
report   counts by advisor, severity; class/outcome mix once classified; session costs
review   print unclassified notes with their aftermath, for a classification sitting
behaviour  steering and abort counts per session, read from the transcripts

Usage:
  python3 notes.py extract [--store ~/.omp/agent/sessions] [--project SUBSTR] [--since YYYY-MM-DD] [--out DIR]
  python3 notes.py report  [--out DIR]
  python3 notes.py review  [--out DIR] [--limit N]
  python3 notes.py behaviour [--store ~/.omp/agent/sessions] [--project SUBSTR]
"""
import argparse, glob, json, os, re, sys

DEF_STORE = os.path.expanduser("~/.omp/agent/sessions")
DEF_OUT = os.path.dirname(os.path.abspath(__file__))
ADV_RE = re.compile(r"<advisory([^>]*)>(.*?)</advisory>", re.S)


def attr(tag, key):
    m = re.search(key + r'=\\?"([^"\\]*)\\?"', tag)
    return m.group(1) if m else ""


def entries(path):
    out = []
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for i, line in enumerate(fh):
            try:
                out.append((i, json.loads(line)))
            except Exception:
                pass
    return out


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


def aftermath(ents, pos, n=5):
    rows = []
    for _, e in ents[pos + 1:pos + 1 + n]:
        if e.get("type") == "custom_message" and e.get("customType") == "advisor":
            break
        m = e.get("message") if isinstance(e, dict) else None
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        if role == "assistant":
            body = text_of(m.get("content"))[:200]
            calls = "; ".join(
                f"{b.get('name')}({str(b.get('arguments'))[:70]})"
                for b in (m.get("content") or [])
                if isinstance(b, dict) and b.get("type") == "toolCall"
            )
            rows.append(("asst: " + body + (" | " + calls if calls else "")).strip())
        elif role == "user":
            t = text_of(m.get("content"))
            if t:
                rows.append("user: " + t[:160])
    return rows


def cost_of(path):
    total = 0.0
    for _, e in entries(path):
        m = e.get("message") if isinstance(e, dict) else None
        if isinstance(m, dict) and m.get("role") == "assistant":
            total += ((m.get("usage") or {}).get("cost") or {}).get("total", 0) or 0
    return total


def cmd_extract(a):
    os.makedirs(a.out, exist_ok=True)
    nf = open(os.path.join(a.out, "notes.jsonl"), "w", encoding="utf-8")
    sf = open(os.path.join(a.out, "sessions.jsonl"), "w", encoding="utf-8")
    notes = sessions = 0
    for proj in sorted(glob.glob(os.path.join(a.store, "*"))):
        if not os.path.isdir(proj):
            continue
        pname = os.path.basename(proj)
        if a.project and a.project not in pname:
            continue
        for f in sorted(glob.glob(os.path.join(proj, "*.jsonl"))):
            base = os.path.basename(f)
            date = base[:10]
            if a.since and date < a.since:
                continue
            sid = base.split("_")[-1][:13]
            ents = entries(f)
            art = f[:-6]  # session artifact dir shares the transcript's stem
            main = cost_of(f)
            adv = sub = 0.0
            if os.path.isdir(art):
                for g in sorted(glob.glob(os.path.join(art, "*.jsonl"))):
                    c = cost_of(g)
                    if os.path.basename(g).startswith("__advisor"):
                        adv += c
                    else:
                        sub += c
            sf.write(json.dumps({
                "project": pname, "session": sid, "date": date,
                "main": round(main, 4), "advisor": round(adv, 4), "sub": round(sub, 4),
            }) + "\n")
            sessions += 1
            for i, e in ents:
                if not (e.get("type") == "custom_message" and e.get("customType") == "advisor"):
                    continue
                for tag, note in ADV_RE.findall(e.get("content") or ""):
                    nf.write(json.dumps({
                        "project": pname, "session": sid, "date": date, "msg": i,
                        "advisor": attr(tag, "advisor"), "severity": attr(tag, "severity") or "nit",
                        "note": " ".join(note.split()), "aftermath": aftermath(ents, i),
                        "class": "", "sub": "", "outcome": "", "checkable": "", "surface": "", "lesson": "", "defect": "",
                    }) + "\n")
                    notes += 1
    nf.close()
    sf.close()
    print(f"wrote {notes} notes, {sessions} sessions to {a.out}")


def read_jsonl(p):
    if not os.path.exists(p):
        sys.exit(f"missing {p} - run extract first")
    return [json.loads(l) for l in open(p, encoding="utf-8")]


def cmd_report(a):
    notes = read_jsonl(os.path.join(a.out, "notes.jsonl"))
    if not notes:
        print("no notes")
        return
    dates = sorted(n["date"] for n in notes)
    print(f"notes {len(notes)}  window {dates[0]} .. {dates[-1]}\n")
    by = {}
    for n in notes:
        k = (n["advisor"] or "unnamed", n["severity"])
        by[k] = by.get(k, 0) + 1
    for (who, sev), c in sorted(by.items()):
        print(f"  {who:<16} {sev:<8} {c}")
    classified = [n for n in notes if n.get("class")]
    if classified:
        print(f"\nclassified {len(classified)}/{len(notes)}")
        for field in ("class", "outcome", "checkable", "surface"):
            m = {}
            for n in classified:
                m[n.get(field) or "-"] = m.get(n.get(field) or "-", 0) + 1
            print(f"  by {field}: " + ", ".join(f"{k}={v}" for k, v in sorted(m.items())))
    ss = os.path.join(a.out, "sessions.jsonl")
    if os.path.exists(ss):
        rows = read_jsonl(ss)
        tm = sum(r["main"] for r in rows)
        ta = sum(r["advisor"] for r in rows)
        tb = sum(r["sub"] for r in rows)
        print(f"\nsessions {len(rows)}  main ${tm:.2f}  advisor ${ta:.2f}  subagent ${tb:.2f}  total ${tm + ta + tb:.2f}")


def cmd_review(a):
    notes = read_jsonl(os.path.join(a.out, "notes.jsonl"))
    left = [n for n in notes if not n.get("class")]
    print(f"unclassified {len(left)}/{len(notes)}")
    for n in left[:a.limit]:
        print(f"\n[{n['date']} {n['session']} {n['advisor']} {n['severity']}] {n['note'][:220]}")
        for l in n.get("aftermath", []):
            print("   ", l[:200])


def behaviour(path):
    """Steers and abort categories for one session file."""
    title = ""
    steers = 0
    aborts = {"user": 0, "request": 0, "other": 0}
    for _, e in entries(path):
        if e.get("type") == "title" and not title:
            title = e.get("title", "")
        m = e.get("message") if isinstance(e.get("message"), dict) else None
        if not m:
            continue
        if m.get("role") == "user" and m.get("steering") is True:
            steers += 1
        elif m.get("role") == "assistant" and m.get("stopReason") == "aborted":
            err = (m.get("errorMessage") or "").strip()
            aborts["user" if err == "Interrupted by user" else
                   "request" if err == "Request was aborted" else "other"] += 1
    return {"title": title, "steers": steers, **aborts}


def cmd_behaviour(a):
    rows = []
    for d in sorted(glob.glob(os.path.join(os.path.expanduser(a.store), "*"))):
        if not os.path.isdir(d) or (a.project and a.project not in os.path.basename(d)):
            continue
        for path in sorted(glob.glob(os.path.join(d, "*.jsonl"))):
            rows.append((os.path.basename(path)[:24], behaviour(path)))
    if not rows:
        print("no session files")
        return
    print(f"{'session':<26}{'title':<34}{'steers':>7}{'ints':>6}{'req':>6}{'other':>6}")
    for sid, b in rows:
        print(f"{sid:<26}{b['title'][:32]:<34}{b['steers']:>7}{b['user']:>6}{b['request']:>6}{b['other']:>6}")
    s = sum(b["steers"] for _, b in rows)
    u = sum(b["user"] for _, b in rows)
    r = sum(b["request"] for _, b in rows)
    o = sum(b["other"] for _, b in rows)
    print(f"\nsessions {len(rows)}  steers {s} in {sum(1 for _, b in rows if b['steers'])} of them"
          f"  aborts {u + r + o} (interrupted {u}, request {r}, other {o})")
    print("counts move while a session runs; 'request' aborts follow session_exit, not an interruption")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract")
    e.add_argument("--store", default=DEF_STORE)
    e.add_argument("--project", default="")
    e.add_argument("--since", default="")
    e.add_argument("--out", default=DEF_OUT)
    e.set_defaults(fn=cmd_extract)
    r = sub.add_parser("report")
    r.add_argument("--out", default=DEF_OUT)
    r.set_defaults(fn=cmd_report)
    v = sub.add_parser("review")
    v.add_argument("--out", default=DEF_OUT)
    v.add_argument("--limit", type=int, default=10)
    v.set_defaults(fn=cmd_review)
    b = sub.add_parser("behaviour")
    b.add_argument("--store", default=DEF_STORE)
    b.add_argument("--project", default="")
    b.set_defaults(fn=cmd_behaviour)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
