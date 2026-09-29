#!/usr/bin/env python3
"""Create (or check, or re-render) an investigation folder.

  python3 scripts/scaffold.py investigations/my-topic --topic "..." --period 2022-01-01/2026-06-30 --languages en,es
  python3 scripts/scaffold.py --check investigations/my-topic       # validate project.json
  python3 scripts/scaffold.py --render investigations/my-topic      # re-render briefs/ after editing project.json

Briefs use <<PLACEHOLDERS>>. Project-level ones (<<TOPIC>>, <<ACTORS_IN_SCOPE>>, <<PROTECTED_RULES>> ...) are filled
from project.json. Run-level ones (<<ROUND>>, <<UNIT>>, <<DIR>>, <<N>>) are left for the orchestrator to fill when
it launches an agent, because they change per launch.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from lib import REPO, today

RUN_LEVEL = {"ROUND", "UNIT", "DIR", "N", "UNIT_DESCRIPTION"}
DIRS = ["briefs", "data/raw", "data/checks", "data/verdicts", "data/verified", "data/staged", "data/secondpass",
        "data/backups", "report/sections", "analysis", "edition", "fixtures", "build"]
REQUIRED = ["slug", "title", "topic", "question", "period", "languages", "actors", "categories", "evidence", "protected"]


def render_values(cfg):
    ev, pr, hs = cfg.get("evidence", {}), cfg.get("protected", {}), cfg.get("house_style", {})
    actors = cfg.get("actors", {})
    grades = ev.get("grades", {})
    never = pr.get("never_name") or []
    naming = ("Never name " + "; ".join(never) + ". ") if never else ""
    if pr.get("name_the_dead_if_source_names"):
        naming += "You may name people who were killed when a source names them, spelled as that source prints it. "
    naming += pr.get("disclaimer", "")
    vocab = {"descriptive_only": "Descriptive categories only. Never write legal labels (for example 'war crime', "
             "'genocide', 'crime against humanity') unless you are quoting a source, and then attribute the quote."}
    per = cfg.get("period", {})
    return {
        "TOPIC": cfg.get("topic", ""),
        "QUESTION": cfg.get("question", ""),
        "PERIOD": f"{per.get('start', '?')} to {per.get('end', '?')}",
        "ACTORS_IN_SCOPE": ", ".join(actors.get("in_scope", [])) or "(not set)",
        "ACTORS_CONTEXT": ", ".join(actors.get("context_only", [])) or "(none)",
        "LANGUAGES": ", ".join(cfg.get("languages", [])),
        "PREFERRED_SOURCES": ", ".join(cfg.get("preferred_sources", [])) or "(none set)",
        "CATEGORIES": ", ".join(cfg.get("categories", [])),
        "HIGH_STAKES_CATEGORIES": ", ".join(cfg.get("high_stakes_categories", [])) or "(none)",
        "PROTECTED_RULES": naming.strip(),
        "VOCAB_RULE": vocab.get(pr.get("vocabulary", "descriptive_only"), pr.get("vocabulary", "")),
        "SPELLING_RULE": pr.get("spelling_rule", ""),
        "HOUSE_STYLE": " ".join(f"{k.capitalize()}: {v}." for k, v in hs.items()),
        "GRADE_RUBRIC": " ".join(f"{g} = {t}" for g, t in grades.items()),
        "ORIGINAL_REQUEST": cfg.get("charter") or ("The user asked: " + cfg.get("question", "")),
        "PROJECT_DIR": cfg.get("_root", ""),
        "LOCAL_HELPERS": cfg.get("local_helpers", ""),
        "WINDOW_DAYS": str(cfg.get("link_window_days", 45)),
        "QUANTITY_NAME": cfg.get("quantity_name", "people reported killed"),
    }


def render_briefs(root):
    cfg = json.loads((root / "project.json").read_text(encoding="utf-8"))
    cfg["_root"] = str(root)
    vals = render_values(cfg)
    out = root / "briefs"
    out.mkdir(exist_ok=True)
    left = set()
    for src in sorted((REPO / "briefs").glob("*.md")):
        text = src.read_text(encoding="utf-8")
        text = re.sub(r"<<([A-Z_]+)>>", lambda m: vals.get(m.group(1), m.group(0)), text)
        left |= {m for m in re.findall(r"<<([A-Z_]+)>>", text)} - RUN_LEVEL
        (out / src.name).write_text(text, encoding="utf-8")
    print(f"rendered {len(list((REPO / 'briefs').glob('*.md')))} briefs into {out}")
    if left:
        print("WARNING unfilled project-level placeholders (add them to project.json):", ", ".join(sorted(left)))


def check(root):
    p = root / "project.json"
    if not p.exists():
        sys.exit(f"missing {p}")
    cfg = json.loads(p.read_text(encoding="utf-8"))
    bad = [k for k in REQUIRED if not cfg.get(k)]
    ev = cfg.get("evidence", {})
    if set(ev.get("grades", {})) - {"A", "B", "C"} or not ev.get("grades"):
        bad.append("evidence.grades (need A, B, C)")
    if not cfg.get("period", {}).get("start") or not cfg.get("period", {}).get("end"):
        bad.append("period.start/end")
    if not cfg.get("actors", {}).get("in_scope"):
        bad.append("actors.in_scope")
    if "reviewer_confirmed" in ev.get("good_fetch", []) and not (root / "DECISIONS.md").read_text(encoding="utf-8").lower().count("reviewer_confirmed"):
        bad.append("good_fetch allows reviewer_confirmed but DECISIONS.md does not record the user's decision")
    if bad:
        sys.exit("project.json problems:\n  - " + "\n  - ".join(bad))
    print("project.json OK")


def create(root, args):
    if (root / "project.json").exists():
        sys.exit(f"{root} already has a project.json; refusing to overwrite")
    for d in DIRS:
        (root / d).mkdir(parents=True, exist_ok=True)
    cfg = json.loads((REPO / "schema" / "project.example.json").read_text(encoding="utf-8"))
    cfg["slug"] = root.name
    if args.topic:
        cfg["topic"] = args.topic
        cfg["title"] = args.title or args.topic[:1].upper() + args.topic[1:]
        cfg["question"] = f"What do open sources document about {args.topic}?"
    if args.title:
        cfg["title"] = args.title
    if args.period:
        s, _, e = args.period.partition("/")
        cfg["period"] = {"start": s, "end": e or s, "asof": e or s}
    if args.languages:
        cfg["languages"] = args.languages.split(",")
    (root / "project.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (root / "DECISIONS.md").write_text(
        f"# Decisions: {cfg['title']}\n\n"
        "> **Charter.** (Paste the user's request in their own words. Every agent brief opens with it.)\n\n"
        f"## {today()}: scaffolded\n- Created from auto-researcher. Answer briefs/00_scoping.md and record each answer below "
        "with the date and the reason.\n", encoding="utf-8")
    (root / "report" / "method.html").write_text(
        "<h2 id=\"method\">Scope, sources and method</h2>\n<p>TODO: scope, sources, grading, verification, limitations. "
        "Use {{STAT:USABLE}}, {{STAT:GA}} etc. for counts.</p>\n", encoding="utf-8")
    (root / ".gitignore").write_text("build/\ndata/backups/\n", encoding="utf-8")
    render_briefs(root)
    print(f"created {root}\nnext: answer briefs/00_scoping.md, edit {root/'project.json'}, then "
          f"python3 scripts/scaffold.py --check {root}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dir")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--render", action="store_true")
    ap.add_argument("--topic")
    ap.add_argument("--title")
    ap.add_argument("--period", help="START/END, ISO dates")
    ap.add_argument("--languages", help="comma list, e.g. en,es")
    a = ap.parse_args()
    root = Path(a.dir).resolve()
    if a.check:
        check(root)
    elif a.render:
        render_briefs(root)
    else:
        create(root, a)


if __name__ == "__main__":
    main()
