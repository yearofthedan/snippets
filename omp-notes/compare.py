#!/usr/bin/env python3
"""Compare replay runs by tag: each case's result per run, catches by severity, a union, notes per case, cost.

  python3 compare.py 150k 150k-r1-evidence 150k-r4-cases --union 150k-r1-evidence,150k-r4-cases
"""
import argparse, json, os, re

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "replay")


def load(path):
    return {r["id"]: r for r in map(json.loads, open(path))} if os.path.exists(path) else {}


p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
p.add_argument("tags", nargs="+", help="run tags, as given to replay.py --tag")
p.add_argument("--union", default="", help="comma-separated tags whose catches are pooled")
p.add_argument("--model", default="openrouter/deepseek/deepseek-v4.1-flash")
a = p.parse_args()
base = os.path.join(DATA, re.sub(r"[^a-z0-9.]+", "-", a.model.lower()).strip("-") + "@")
cases = load(os.path.join(DATA, "cases.jsonl"))
judged = {t: load(base + t + ".judged.jsonl") for t in a.tags}
notes = {t: load(base + t + ".jsonl") for t in a.tags}
union = [t for t in a.union.split(",") if t]
code = {"same": "S", "partial": "p", "none": "."}


def hit(t, i):
    return judged[t].get(i, {}).get("match") in ("same", "partial")


ids = sorted(i for i in cases if any(i in judged[t] for t in a.tags))
print(f"{'case':44}{'sev':9}" + "".join(f"{t[:10]:>11}" for t in a.tags) + ("      union" if union else ""))
for i in ids:
    row = "".join(f"{code.get(judged[t].get(i, {}).get('match'), '-'):>11}" for t in a.tags)
    u = ("        yes" if any(hit(t, i) for t in union) else "         no") if union else ""
    print(f"{i:44}{cases[i]['severity']:9}{row}{u}")
for sev in ("blocker", "concern"):
    sel = [i for i in ids if cases[i]["severity"] == sev]
    row = "".join(f"{sum(hit(t, i) for i in sel):>11}" for t in a.tags)
    u = f"{sum(any(hit(t, i) for t in union) for i in sel):>11}" if union else ""
    print(f"{'caught ' + sev + 's of ' + str(len(sel)):53}{row}{u}")
row = "".join(f"{sum(len(notes[t][i]['notes']) for i in ids if i in notes[t]) / max(1, len(ids)):>11.1f}" for t in a.tags)
print(f"{'notes per case':53}{row}")
row = "".join(f"{sum((notes[t][i]['usage'] or {}).get('cost', {}).get('total', 0) for i in ids if i in notes[t]):>11.3f}" for t in a.tags)
print(f"{'cost $':53}{row}")
