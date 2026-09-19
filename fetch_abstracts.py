#!/usr/bin/env python3
"""Fetch candidate abstracts for manual comparison with the reviewed snapshots.

    python3 fetch_abstracts.py --dry-run
    python3 fetch_abstracts.py  # writes data/abstract-candidates.json only

Never replaces data/abstracts.json or assets/abstracts.js. After checking wording,
source URL and version, update data/abstracts.json, run
node scripts/render-abstracts.cjs, then python3 build.py.
"""

import argparse
import datetime
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
PUBS = os.path.join(HERE, "data", "publications.json")
OUT = os.path.join(HERE, "data", "abstract-candidates.json")

ARXIV_API = "https://export.arxiv.org/api/query?id_list="
CROSSREF_API = "https://api.crossref.org/works/"
UA = "thenealon.github.io abstract fetcher (nobushaw@vcu.edu)"

ATOM_SUMMARY = re.compile(r"<summary[^>]*>(.*?)</summary>", re.S)
TAGS = re.compile(r"<[^>]+>")
WS = re.compile(r"[ \t]*\n[ \t]*")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def tidy(text):
    """Collapse the hard-wrapping that arXiv abstracts arrive with."""
    text = html.unescape(text)
    text = TAGS.sub("", text)
    text = WS.sub(" ", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def from_arxiv(arxiv_id):
    body = get(ARXIV_API + urllib.parse.quote(arxiv_id))
    m = ATOM_SUMMARY.search(body)
    return tidy(m.group(1)) if m else None


def from_crossref(doi):
    body = get(CROSSREF_API + urllib.parse.quote(doi))
    data = json.loads(body)
    raw = data.get("message", {}).get("abstract")
    if not raw:
        return None
    # Crossref returns JATS; strip the title element publishers often include
    raw = re.sub(r"<jats:title>.*?</jats:title>", "", raw, flags=re.S | re.I)
    return tidy(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delay", type=float, default=3.0,
                    help="seconds between requests (arXiv asks for >= 3)")
    args = ap.parse_args()

    with open(PUBS, encoding="utf-8") as f:
        pubs = json.load(f)

    out, missing = {}, []
    for pub in pubs:
        key, text, src = pub["key"], None, None

        if pub.get("arxiv"):
            try:
                text = from_arxiv(pub["arxiv"])
                src = "arXiv:" + pub["arxiv"]
            except (urllib.error.URLError, OSError) as e:
                print("  ! arXiv %s: %s" % (pub["arxiv"], e), file=sys.stderr)
            time.sleep(args.delay)

        if not text and pub.get("doi"):
            try:
                text = from_crossref(pub["doi"])
                src = "Crossref " + pub["doi"]
            except (urllib.error.URLError, OSError, ValueError) as e:
                print("  ! Crossref %s: %s" % (pub["doi"], e), file=sys.stderr)
            time.sleep(1.0)

        if text:
            out[key] = {"text": text, "source": src}
            print("  ok  %-42s %5d chars  (%s)" % (key, len(text), src))
        else:
            missing.append(key)
            print("  --  %-42s no abstract available" % key)

    print("\n%d of %d abstracts retrieved." % (len(out), len(pubs)))
    if missing:
        print("No abstract for: " + ", ".join(missing))

    if args.dry_run:
        print("Dry run; %s not written." % OUT)
        return

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Wrote %s" % OUT)


if __name__ == "__main__":
    main()
