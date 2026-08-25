#!/usr/bin/env python3
"""Resolve Wikipedia portraits once, at build time, into data/genealogy.json.

The applet used to ask Wikipedia for each portrait from the browser. That
works on a real web server and fails everywhere else -- from a file:// page,
and inside any sandboxed preview -- because the request is cross-origin and
the sandbox blocks it. Resolving the image URLs here instead means the page
only ever loads a plain <img>, which nothing blocks.

    python3 fetch_portraits.py            # fill in "photo" for everyone
    python3 fetch_portraits.py --dry-run

Each record with a "wiki" title gains:
    photo         a thumbnail URL on upload.wikimedia.org
    photo_credit  the file's description page, for attribution

Wikipedia's REST summary API is public and needs no key. Images are reused
under their own licences; the credit link goes to the file page where the
licence and author are stated.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "data", "genealogy.json")
API = "https://en.wikipedia.org/api/rest_v1/page/summary/"
UA = "thenealon.github.io portrait fetch (nobushaw@vcu.edu)"


def summary(title):
    url = API + urllib.parse.quote(title.replace(" ", "_"), safe="")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delay", type=float, default=0.4)
    ap.add_argument("--width", type=int, default=400)
    args = ap.parse_args()

    with open(GEN, encoding="utf-8") as f:
        people = json.load(f)

    want = [p for p in people if p.get("wiki")]
    print("%d of %d records have a Wikipedia title\n" % (len(want), len(people)))

    got = 0
    for p in want:
        try:
            d = summary(p["wiki"])
        except (urllib.error.URLError, OSError, ValueError) as e:
            print("  !  %-32s %s" % (p["name"][:32], e), file=sys.stderr)
            time.sleep(args.delay)
            continue

        thumb = (d.get("thumbnail") or {}).get("source")
        if thumb:
            # ask for a wider rendering than the default 320px thumbnail
            p["photo"] = thumb.replace("/320px-", "/%dpx-" % args.width)
            p["photo_credit"] = ("https://en.wikipedia.org/wiki/File:" +
                                 thumb.rsplit("/", 1)[-1].split("px-", 1)[-1])
            got += 1
            print("  ok %-32s %s" % (p["name"][:32], p["photo"][:70]))
        else:
            p.pop("photo", None)
            p.pop("photo_credit", None)
            print("  -- %-32s article has no image" % p["name"][:32])
        time.sleep(args.delay)

    print("\n%d portraits resolved." % got)
    if args.dry_run:
        print("Dry run; %s not written." % GEN)
        return
    with open(GEN, "w", encoding="utf-8") as f:
        json.dump(people, f, ensure_ascii=False, indent=1)
    print("Wrote %s\nNow run: python3 build.py" % GEN)


if __name__ == "__main__":
    main()
