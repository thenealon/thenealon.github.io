#!/usr/bin/env python3
"""Build data/genealogy.json from the Mathematics Genealogy Project.

Why a script and not a hand-typed file: your academic siblings and their
descendants run to hundreds of people, each with a graduation year, an
institution and a dissertation title. Those are facts with exact wording, and
the only honest way to get them is from the source. Nothing here is typed
from memory.

    python3 fetch_genealogy.py                  # ancestors + Bollobas's tree
    python3 fetch_genealogy.py --down-depth 3   # go a generation deeper
    python3 fetch_genealogy.py --dry-run        # report only, write nothing

PLEASE BE CONSIDERATE. The MGP is a small, free, grant-funded service run by
the NDSU mathematics department. This script therefore caches every page it
fetches (see .mgp-cache/), waits between requests, and refuses to fetch more
than --max-pages in a run. Re-running is nearly free because of the cache. Do
not lower the delay. If you want the whole database, they would rather you
wrote to them than crawled it.

Standard library only.
"""

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".mgp-cache")
OUT = os.path.join(HERE, "data", "genealogy.json")
EXTRA = os.path.join(HERE, "data", "genealogy-extra.json")

BASE = "https://www.genealogy.math.ndsu.nodak.edu/id.php?id="
ROOT = 163297                      # Neal Bushaw
UA = ("thenealon.github.io genealogy builder (nobushaw@vcu.edu) -- "
      "personal use, cached, rate limited")

TAG = re.compile(r"<[^>]+>")
LINKID = re.compile(r'id\.php\?id=(\d+)')


def clean(s):
    return " ".join(html.unescape(TAG.sub(" ", s)).split())


def fetch(mgp_id, delay):
    """Cached GET of one MGP record."""
    if not os.path.isdir(CACHE):
        os.makedirs(CACHE)
    path = os.path.join(CACHE, "%d.html" % mgp_id)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read(), True
    req = urllib.request.Request(BASE + str(mgp_id), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        body = resp.read().decode("utf-8", "replace")
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    time.sleep(delay)
    return body, False


def parse(mgp_id, body):
    """Pull one person out of an MGP page."""
    rec = {"id": str(mgp_id), "mgp": mgp_id}

    m = re.search(r'<h2[^>]*>(.*?)</h2>', body, re.S)
    if m:
        rec["name"] = clean(m.group(1))
    if not rec.get("name"):
        return None

    # "Ph.D. Universität Berlin 1864"  /  "Dr. phil. ... 1902"
    m = re.search(r'<span[^>]*id=["\']thesisTitle', body)
    deg = re.search(r'(Ph\.D\.|Dr\.[^<\n]{0,24}|Sc\.D\.|Doctorat[^<\n]{0,20})\s*'
                    r'([^<\n]*?)\s*(1[0-9]{3}|20[0-9]{2})',
                    TAG.sub("\n", body))
    if deg:
        inst = clean(deg.group(2))
        if inst:
            rec["inst"] = inst
        rec["year"] = int(deg.group(3))

    m = re.search(r'Dissertation:\s*(.*?)(?:<br|</|\n)', body, re.S)
    if m:
        t = clean(m.group(1))
        if t and t.lower() != "dissertation:":
            rec["thesis"] = t

    # MacTutor biography, when MGP links one
    m = re.search(r'mathshistory\.st-andrews\.ac\.uk/Biographies/([^"\'<>\s]+)', body)
    if m:
        rec["mactutor"] = m.group(1).replace(".html", "")

    # Advisor 1: <a href="id.php?id=N">
    advisors = []
    for am in re.finditer(r'Advisor\s*\d*:\s*<a[^>]*id\.php\?id=(\d+)', body):
        advisors.append(am.group(1))
    if advisors:
        rec["advisors"] = advisors

    # the students table: id, school, year, descendant count
    students = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', body, re.S):
        if "id.php?id=" not in row:
            continue
        sid = LINKID.search(row)
        cells = [clean(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        if not sid or len(cells) < 2:
            continue
        yr = None
        desc = 0
        for c in cells[1:]:
            if re.fullmatch(r'(1[0-9]{3}|20[0-9]{2})', c):
                yr = int(c)
            elif re.fullmatch(r'\d+', c):
                desc = int(c)
        students.append({"id": sid.group(1), "year": yr, "desc": desc})
    rec["_students"] = students
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=int, default=ROOT)
    ap.add_argument("--down-from", type=int, default=None,
                    help="MGP id whose descendants to include "
                         "(default: the root's first advisor)")
    ap.add_argument("--down-depth", type=int, default=2,
                    help="generations of descendants below that person")
    ap.add_argument("--max-pages", type=int, default=600)
    ap.add_argument("--delay", type=float, default=2.0,
                    help="seconds between uncached requests; do not lower this")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.delay < 1.0:
        print("Refusing to hammer a free academic service; --delay must be >= 1.",
              file=sys.stderr)
        return 1

    seen, fetched, people = {}, [0], {}

    def get(mgp_id):
        mgp_id = int(mgp_id)
        if mgp_id in people:
            return people[mgp_id]
        if fetched[0] >= args.max_pages:
            return None
        try:
            body, cached = fetch(mgp_id, args.delay)
        except (urllib.error.URLError, OSError) as e:
            print("  ! %s: %s" % (mgp_id, e), file=sys.stderr)
            return None
        if not cached:
            fetched[0] += 1
        rec = parse(mgp_id, body)
        if rec:
            people[mgp_id] = rec
            print("  %-7s %-42s %s" % (mgp_id, rec["name"][:42],
                                       "cache" if cached else "fetched"))
        return rec

    # --- upward: every advisor, all the way back -------------------------
    print("Ancestors:")
    stack = [args.root]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen[cur] = 1
        rec = get(cur)
        if not rec:
            continue
        for a in rec.get("advisors", []):
            stack.append(int(a))

    # --- downward: siblings and their descendants ------------------------
    start = args.down_from
    if start is None:
        root_rec = people.get(args.root)
        advs = root_rec.get("advisors", []) if root_rec else []
        start = int(advs[0]) if advs else None

    if start is not None:
        print("\nDescendants of %s, %d generation(s) down:"
              % (people.get(start, {}).get("name", start), args.down_depth))
        frontier = [(start, 0)]
        while frontier:
            cur, depth = frontier.pop(0)
            rec = people.get(cur) or get(cur)
            if not rec or depth >= args.down_depth:
                continue
            for st in rec.get("_students", []):
                sid = int(st["id"])
                child = get(sid)
                if child:
                    frontier.append((sid, depth + 1))

    # --- assemble --------------------------------------------------------
    keep = set(people)
    out = []
    for mgp_id, rec in sorted(people.items()):
        r = {k: v for k, v in rec.items() if k != "_students"}
        r["advisors"] = [a for a in rec.get("advisors", []) if int(a) in keep]
        out.append(r)

    # hand-kept additions: wikipedia titles, coauthor flags, who is "me"
    if os.path.exists(EXTRA):
        with open(EXTRA, encoding="utf-8") as f:
            extra = json.load(f)
        hits = 0
        for r in out:
            e = extra.get(r["id"])
            if e:
                r.update(e)
                hits += 1
        print("\nMerged %d entries from %s" % (hits, os.path.basename(EXTRA)))

    print("\n%d people, %d advisor edges, %d pages fetched this run."
          % (len(out), sum(len(r.get("advisors", [])) for r in out), fetched[0]))
    withthesis = sum(1 for r in out if r.get("thesis"))
    withyear = sum(1 for r in out if r.get("year"))
    print("%d have a dissertation title, %d have a year." % (withthesis, withyear))
    if fetched[0] >= args.max_pages:
        print("Hit --max-pages; rerun to continue (the cache makes it cheap).")

    if args.dry_run:
        print("Dry run; %s not written." % OUT)
        return 0

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("Wrote %s -- now run: python3 build.py" % OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
