"""Shared helpers for the auto-researcher scripts. Standard library only.

Every script takes `--project <dir>` (default: the current directory if it holds a project.json) and works on
that investigation folder. Nothing here knows about any particular topic.
"""
import argparse
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import unquote

REPO = Path(__file__).resolve().parent.parent
MARKER = re.compile(r"\{\{c:([^}]+)\}\}")
DEFAULT_GOOD_FETCH = ("confirmed", "partially_supports")
BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")


# ------------------------------------------------------------------ project
class Project:
    def __init__(self, root):
        self.root = Path(root).resolve()
        cfg = self.root / "project.json"
        if not cfg.exists():
            sys.exit(f"no project.json in {self.root} (pass --project <dir>)")
        self.cfg = json.loads(cfg.read_text(encoding="utf-8"))
        self.data = self.root / "data"
        self.report = self.root / "report"
        self.sections = self.report / "sections"
        self.analysis = self.root / "analysis"
        self.build = self.root / "build"
        self.backups = self.data / "backups"

    @property
    def good_fetch(self):
        return set(self.cfg.get("evidence", {}).get("good_fetch", DEFAULT_GOOD_FETCH))

    @property
    def partisan_prefix(self):
        return self.cfg.get("evidence", {}).get("partisan_prefix", "partisan")

    def is_partisan(self, source):
        return (source.get("source_type") or "").startswith(self.partisan_prefix)

    def verified_files(self):
        """Claim files: data/verified*/*.json, minus stray backups (they would override live claims)."""
        out = []
        for f in sorted(glob.glob(str(self.data / "verified*" / "*.json"))):
            if re.search(r"\.(pre_|bak)", os.path.basename(f)):
                print(f"WARN skipping backup-looking file in claims folder: {f}", file=sys.stderr)
                continue
            out.append(f)
        return out

    def load_claims(self):
        """{id: claim}. Includes rejected claims (verdict == 'rejected'): callers decide."""
        claims = {}
        for f in self.verified_files():
            try:
                d = json.loads(Path(f).read_text(encoding="utf-8"))
            except Exception as e:  # noqa: BLE001
                print(f"WARN unreadable {f}: {e}", file=sys.stderr)
                continue
            for c in d.get("claims", []):
                claims[c["id"]] = c
        return claims

    def claim_files_by_id(self):
        m = {}
        for f in self.verified_files():
            for c in json.loads(Path(f).read_text(encoding="utf-8")).get("claims", []):
                m[c["id"]] = f
        return m

    def usable_sources(self, claim):
        return [s for s in claim.get("sources", []) if s.get("fetch_status", "confirmed") in self.good_fetch]


def add_project_arg(ap):
    ap.add_argument("--project", default=None, help="investigation folder (default: cwd if it has project.json)")
    return ap


def get_project(args_or_path=None):
    path = getattr(args_or_path, "project", args_or_path)
    if not path:
        path = "." if (Path(".") / "project.json").exists() else None
    if not path:
        sys.exit("pass --project <investigation dir> (or run inside one)")
    return Project(path)


def cli(description, *extra):
    """Tiny argparse wrapper: every script gets --project. `extra` are (flags, kwargs) tuples."""
    ap = argparse.ArgumentParser(description=description)
    add_project_arg(ap)
    for flags, kw in extra:
        ap.add_argument(*([flags] if isinstance(flags, str) else flags), **kw)
    return ap.parse_args()


# ------------------------------------------------------------------ files
def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dump_json(obj, like=None):
    """Serialise with the indent the file already used (so diffs stay small)."""
    indent = 1
    if like:
        m = re.match(r"\{\n( +)", like)
        indent = len(m.group(1)) if m else 1
    s = json.dumps(obj, indent=indent, ensure_ascii=False)
    return s + ("\n" if (like or "\n").endswith("\n") else "")


def backup_files(project, files, tag):
    """Copy files to data/backups/<tag>/<parent>/<name>. NEVER overwrites an existing backup: the first copy
    is the pre-change original. Returns the backup dir."""
    root = project.backups / tag
    for f in files:
        f = Path(f)
        dest = root / f.parent.name / f.name
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)
    return root


# ------------------------------------------------------------------ urls and text
def norm_url(u):
    """Normalise for de-duplication: unquote twice, drop scheme, www., a leading /en/ or /ar/ style language
    prefix, fragments and trailing slashes. The same article under a differently encoded URL is one source."""
    u = unquote(unquote(u or "")).strip().lower()
    u = re.sub(r"^[a-z][a-z0-9+.-]*://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = u.split("#")[0].rstrip("/")
    u = re.sub(r"^([^/]+)/(?:[a-z]{2})(?=/)", r"\1", u)
    return u


DIAC = re.compile(r"[ً-ٰٟـ]")
QUOTES = str.maketrans({c: '"' for c in "“”„«»″"} | {c: "'" for c in "‘’‚′"})


def norm_text(s):
    s = DIAC.sub("", s.replace("‏", "").replace("‎", "")).translate(QUOTES)
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r" ([,.;:!?،؛)])", r"\1", s)  # tag stripping leaves spaces before punctuation


def excerpt_found(excerpt, text):
    """Verbatim match. Tolerant ONLY of whitespace, Arabic diacritics, quote-mark style, bidi marks and
    trailing punctuation an agent may have added to close its excerpt. Nothing else."""
    e, t = norm_text(excerpt).rstrip(" .،,;:"), norm_text(text)
    return bool(e) and e in t


def _strip_html(t):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))


_CACHE = {}


def fetch_text(url, project=None, min_chars=2500):
    """Return (text, via). via is 'live', 'browser-ua', 'archive' or 'fixture'; text is '' if unfetchable.

    fixture://<name> reads <project>/fixtures/<name>: offline demos and tests. Everything else uses curl with a
    timeout (never leave a download running). A short page (< min_chars, usually a block or a JS shell) is
    retried with a browser user agent, then through the web archive."""
    if url in _CACHE:
        return _CACHE[url]
    res = ("", "none")
    if url.startswith("fixture://"):
        base = (project.root if project else Path.cwd()) / "fixtures" / url[len("fixture://"):]
        res = (_strip_html(base.read_text(encoding="utf-8")), "fixture") if base.exists() else ("", "none")
    else:
        for ua, via in (("Mozilla/5.0", "live"), (BROWSER_UA, "browser-ua")):
            t = _curl(url, ua)
            if len(t) >= min_chars:
                res = (t, via)
                break
        if not res[0]:
            arch = _archive_url(url)
            if arch:
                t = _curl(arch, BROWSER_UA)
                if len(t) >= min_chars:
                    res = (t, "archive")
    _CACHE[url] = res
    return res


def _curl(url, ua):
    try:
        r = subprocess.run(["curl", "-sL", "-m", "45", "-A", ua, url], capture_output=True, timeout=60)
    except Exception:  # noqa: BLE001
        return ""
    return _strip_html(r.stdout.decode("utf-8", "replace"))


def _archive_url(url):
    try:
        r = subprocess.run(["curl", "-s", "-m", "30", "https://archive.org/wayback/available?url=" + url],
                           capture_output=True, timeout=40)
        snap = json.loads(r.stdout.decode("utf-8", "replace")).get("archived_snapshots", {}).get("closest", {})
        return snap.get("url") if snap.get("available") else None
    except Exception:  # noqa: BLE001
        return None


def check_source(src, project=None):
    """Status of one source's excerpt: exact | not_found | no_quote | fetch_failed | snippet_only."""
    if src.get("fetch_status") == "snippet_only":
        return "snippet_only"
    if not (src.get("supporting_excerpt") or "").strip():
        return "no_quote"
    text, via = fetch_text(src.get("url", ""), project)
    if not text:
        return "fetch_failed"
    return "exact" if excerpt_found(src["supporting_excerpt"], text) else "not_found"


# ------------------------------------------------------------------ misc
def numbers(text):
    t = text.replace(",", "")
    return {n.lstrip("0") or "0" for n in re.findall(r"\d+(?:\.\d+)?", t)}


WORDNUM = {"two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
           "ten": "10", "eleven": "11", "twelve": "12", "dozen": "12", "hundred": "100"}


def claim_text(c):
    """Everything a sentence citing this claim may legitimately draw a number, date or name from."""
    parts = [c.get(k, "") for k in ("statement", "figures", "date", "location", "notes", "actor", "osint_status")]
    parts += c.get("entities_named") or []
    parts += [v.get("name", "") for v in c.get("victims_named") or []]
    for s in c.get("sources", []):
        parts += [s.get("supporting_excerpt", ""), s.get("title", ""), s.get("title_en", ""), s.get("date", "")]
    t = " ".join(str(p) for p in parts).lower()
    for w, d in WORDNUM.items():
        t += f" {d}" if re.search(rf"\b{w}\b", t) else ""
    return t


def stamp():
    return time.strftime("%Y%m%d-%H%M%S")


def today():
    return time.strftime("%Y-%m-%d")
