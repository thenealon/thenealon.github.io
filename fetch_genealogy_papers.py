#!/usr/bin/env python3
"""Attach one significant, highly cited paper to genealogy records.

The ordinary site build is offline.  Run this maintenance command when the
genealogy changes or its paper links need refreshing:

    python3 fetch_genealogy_papers.py
    python3 fetch_genealogy_papers.py --dry-run

Author and citation data come from OpenAlex.  The script accepts only strong
name matches, favors mathematical author profiles and matching institutions,
and skips ambiguous people.  For each accepted author it takes the most-cited
article-like work for which it can provide a publisher/DOI landing page, or an
arXiv abstract page when no journal page is available.  It never downloads or
hosts a paper.
"""

import argparse
import concurrent.futures
import datetime
import html
import json
import math
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request


HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "data", "genealogy.json")
API = "https://api.openalex.org/"
MAILTO = "nobushaw@vcu.edu"
UA = "thenealon.github.io genealogy paper links (%s)" % MAILTO
ARTICLE_TYPES = {"article", "preprint", "proceedings-article"}
MATH_WORDS = {
    "algebra", "bound", "clique", "color", "colour", "combinator", "convex",
    "cycle", "degree", "density", "dimension", "edge", "erdos", "extremal",
    "finite", "function", "geometry", "graph", "group",
    "hypergraph", "inequal", "isoperimetric", "markov", "matching", "matroid",
    "matrix", "measure", "number", "operator", "optim", "order", "path", "plane",
    "percolation", "polynomial", "probab", "ramsey", "random", "regular",
    "saturation", "sequence", "set", "space", "szemeredi", "theorem", "topolog",
    "turan", "vertex",
}
CROSSREF = "https://api.crossref.org/works"
REJECT_TITLES = {
    "assessing the continuum of care pathway for maternal health in south asia and sub saharan africa",
    "charged cylindrical surfaces effect of finite ion size",
    "combinatorial chemistry in the development of new crop protection products",
    "comparing simple scoring with irt scoring of personality measures",
    "conditional global regularity of schrodinger maps subthreshold dispersed energy",
    "concrete geographies",
    "counter knowledge and realised absorptive capacity",
    "does lootable wealth breed disorder",
    "emotional intelligence and mismatching expressive and verbal messages a contribution to detection of deception",
    "graph theory",
    "mandatory helmet legislation as a policy tool for reducing motorcycle fatalities pinpointing the efficacy of universal helmet laws",
    "pre school children s knowledge of english phonology",
    "residential location in a three dimensional city",
    "size dependent aggregation of graphene oxide",
    "structural and functional annotation of solute carrier transporters implication for drug discovery",
    "the forest cycle and low river flows a review of uk and international studies",
    "the monteregian hills a canadian petrographical province",
    "optimal vehicle speed trajectory on a signalized arterial with consideration of queue",
    "counting large numbers of events in small registers",
}
# Hand-checked records resolve common-name collisions and historically
# important papers that citation indexes do not represent reliably.
MANUAL_PAPERS = {
    "adams": {"title": "On the non-existence of elements of Hopf invariant one",
              "year": 1960, "journal_url": "https://doi.org/10.2307/1970147"},
    "carne": {"title": "A Uniform Algebra of Analytic Functions on a Banach Space",
              "year": 1989, "journal_url": "https://doi.org/10.2307/2001402"},
    "eldridge": {"title": "Packings of graphs and applications to computational complexity",
                 "year": 1978, "journal_url": "https://doi.org/10.1016/0095-8956(78)90030-8"},
    "fejer": {"title": "Ueber die arithmetischen Mittel erster Ordnung der Fourierreihe",
              "year": 1904, "archive_url": "https://eudml.org/doc/59166"},
    "gamblin": {"title": "The Spack package manager: bringing order to HPC software chaos",
                "year": 2015, "journal_url": "https://doi.org/10.1145/2807591.2807623"},
    "gauss": {"title": "Disquisitiones generales circa superficies curvas",
              "year": 1827,
              "archive_url": "https://quod.lib.umich.edu/u/umhistmath/ABR0732.0001.001?view=toc"},
    "harris": {"title": "List-colourings of graphs", "year": 1985,
               "journal_url": "https://doi.org/10.1007/BF02582936"},
    "haxell": {"title": "A condition for matchability in hypergraphs", "year": 1995,
               "journal_url": "https://doi.org/10.1007/BF01793010"},
    "johnson": {"title": "Locating a robber with multiple probes", "year": 2018,
                "journal_url": "https://doi.org/10.1016/j.disc.2017.08.028"},
    "juskevicius": {"title": "Optimal Probability Inequalities for Random Walks Related to Problems in Extremal Combinatorics",
                    "year": 2012, "journal_url": "https://doi.org/10.1137/110834913"},
    "kummer": {"title": "Zur Theorie der complexen Zahlen", "year": 1844,
               "archive_url": "https://eudml.org/doc/147393"},
    "lee": {"title": "Line percolation", "year": 2018,
            "journal_url": "https://doi.org/10.1002/rsa.20755"},
    "liu": {"title": "Highly connected subgraphs of graphs with given independence number",
            "year": 2007, "arxiv_url": "https://arxiv.org/abs/math/0702354"},
    "montagh": {"title": "Unavoidable Subgraphs of Colored Graphs", "year": 2008,
                "journal_url": "https://doi.org/10.1016/j.disc.2007.08.102"},
    "morris": {"title": "Independent sets in hypergraphs", "year": 2015,
               "arxiv_url": "https://arxiv.org/abs/1204.6530"},
    "read": {"title": "A Solution to the Invariant Subspace Problem", "year": 1984,
             "journal_url": "https://doi.org/10.1112/blms/16.4.337"},
    "smith": {"title": "Monotone Cellular Automata in a Random Environment", "year": 2015,
              "journal_url": "https://doi.org/10.1017/S0963548315000012"},
    "smith2": {"title": "On a conjecture of Gentner and Rautenbach", "year": 2018,
               "arxiv_url": "https://arxiv.org/abs/1611.07513"},
    "story": {"title": "Notes on the ‘15’ Puzzle", "year": 1879,
              "journal_url": "https://doi.org/10.2307/2369492"},
    "szabo": {"title": "The oriented cycle game", "year": 1998,
              "journal_url": "https://doi.org/10.1016/S0012-365X(97)00224-0"},
}
BLOCKED_IDS = {"snyder"}


def norm(value):
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def tokens(value):
    return set(norm(value).split())


def get(path, params, attempts=4):
    params = dict(params)
    params["mailto"] = MAILTO
    url = API + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=35) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
        time.sleep(1.5 * (attempt + 1))


def crossref_get(person_name, attempts=4):
    params = {
        "query.author": '"%s"' % person_name,
        "filter": "type:journal-article",
        "rows": 100,
        "mailto": MAILTO,
        "select": ("DOI,title,author,is-referenced-by-count,published-print,"
                   "published-online,publisher,container-title,URL"),
    }
    url = CROSSREF + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url, headers={"User-Agent": "thenealon.github.io/1.0 (mailto:%s)" % MAILTO})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)["message"]["items"]
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def is_math_author(author):
    for topic in author.get("topics") or []:
        field = topic.get("field") or {}
        if norm(field.get("display_name")) == "mathematics":
            return True
        text = norm(topic.get("display_name"))
        if any(word in text for word in ("graph", "combinator", "mathemat", "geometry",
                                         "topology", "probability", "algebra")):
            return True
    return False


def institution_overlap(person, author):
    wanted = tokens(person.get("inst")) - {
        "university", "universitat", "universite", "college", "institute", "of", "the"
    }
    if not wanted:
        return False
    names = []
    for aff in author.get("affiliations") or []:
        names.append((aff.get("institution") or {}).get("display_name", ""))
    for inst in author.get("last_known_institutions") or []:
        names.append(inst.get("display_name", ""))
    return any(wanted & tokens(name) for name in names)


def name_score(person_name, author_name):
    p, a = norm(person_name), norm(author_name)
    if p == a:
        return 100
    pt, at = p.split(), a.split()
    if not pt or not at or pt[-1] != at[-1]:
        return 0
    if pt[0] == at[0]:
        return 88
    if pt[0][0] == at[0][0]:
        return 72
    return 0


def choose_author(person):
    data = get("authors", {"search": person["name"], "per-page": 10})
    if not data.get("results"):
        bits = person["name"].split()
        if len(bits) > 2:
            data = get("authors", {"search": bits[0] + " " + bits[-1], "per-page": 10})
    ranked = []
    for author in data.get("results", []):
        base = name_score(person["name"], author.get("display_name", ""))
        if not base:
            continue
        math_author = is_math_author(author)
        inst_match = institution_overlap(person, author)
        score = base + (18 if math_author else 0) + (28 if inst_match else 0)
        score += min(5, math.log10(max(1, author.get("works_count", 0))) * 2)
        ranked.append((score, base, math_author, inst_match, author))
    # A shortened or initialed name must never outrank an available exact
    # full-name record merely because it has a modern institutional profile.
    if ranked:
        strongest_name = max(row[1] for row in ranked)
        ranked = [row for row in ranked if row[1] == strongest_name]
    ranked.sort(key=lambda row: row[0], reverse=True)
    if not ranked:
        return None, "no matching OpenAlex author"
    best = ranked[0]
    gap = best[0] - ranked[1][0] if len(ranked) > 1 else 99
    # Exact names are accepted when they identify a mathematical profile and
    # are not tied with another plausible profile.  Non-exact names need an
    # institutional match or a clear margin.
    if best[1] == 100 and best[2] and gap >= 8:
        return best[4], None
    if best[1] >= 88 and best[2] and (best[3] or gap >= 18):
        return best[4], None
    return None, "ambiguous OpenAlex author match"


def paper_urls(work):
    doi = work.get("doi") or ""
    if doi and "10.48550/arxiv" not in doi.lower():
        return doi.replace("http://dx.doi.org/", "https://doi.org/") \
                  .replace("http://doi.org/", "https://doi.org/"), None

    arxiv = None
    journal = None
    locations = [work.get("primary_location") or {}] + (work.get("locations") or [])
    for loc in locations:
        url = loc.get("landing_page_url") or ""
        if not url or url.lower().endswith(".pdf"):
            continue
        source = loc.get("source") or {}
        if "arxiv.org/abs/" in url:
            arxiv = arxiv or url
        elif source.get("type") == "journal":
            journal = journal or url
    return journal, arxiv


def is_mathematical_work(work):
    topic = work.get("primary_topic") or {}
    field = topic.get("field") or {}
    if norm(field.get("display_name")) == "mathematics":
        return True
    title = norm(work.get("display_name"))
    return any(stem in title for stem in MATH_WORDS)


def crossref_year(work):
    for key in ("published-print", "published-online"):
        parts = (work.get(key) or {}).get("date-parts") or []
        if parts and parts[0]:
            return parts[0][0]
    return None


def clean_title(value):
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", "", value)
    return " ".join(value.split())


def choose_crossref_work(person):
    matches = []
    for work in crossref_get(person["name"]):
        title = clean_title(" ".join(work.get("title") or []))
        doi = work.get("DOI")
        if not title or not doi or not any(stem in norm(title) for stem in MATH_WORDS):
            continue
        if norm(title) in REJECT_TITLES:
            continue
        best_name = 0
        for author in work.get("author") or []:
            candidate = " ".join(filter(None, (author.get("given"), author.get("family"))))
            best_name = max(best_name, name_score(person["name"], candidate))
        if best_name < 88:
            continue
        matches.append((work.get("is-referenced-by-count", 0), work, title))
    if not matches:
        return None
    matches.sort(key=lambda row: row[0], reverse=True)
    cited_by, work, title = matches[0]
    return {
        "title": title,
        "year": crossref_year(work),
        "cited_by": cited_by,
        "source": "Crossref",
        "checked": datetime.date.today().isoformat(),
        "journal_url": "https://doi.org/" + work["DOI"],
        "doi": work["DOI"],
    }


def choose_work(author):
    author_id = author["id"].rsplit("/", 1)[-1]
    data = get("works", {
        "filter": "author.id:%s" % author_id,
        "sort": "cited_by_count:desc",
        "per-page": 50,
        "select": ("id,display_name,title,type,cited_by_count,doi,primary_location,"
                   "locations,publication_year,primary_topic"),
    })
    for work in data.get("results", []):
        if work.get("type") not in ARTICLE_TYPES or not work.get("display_name"):
            continue
        if not is_mathematical_work(work):
            continue
        if norm(work["display_name"]) in {"extremal graph theory", "modern graph theory",
                                          "graph theory"}:
            continue
        journal, arxiv = paper_urls(work)
        if not journal and not arxiv:
            continue
        record = {
            "title": work["display_name"],
            "year": work.get("publication_year"),
            "cited_by": work.get("cited_by_count", 0),
            "source": "OpenAlex",
            "checked": datetime.date.today().isoformat(),
            "openalex": work["id"],
        }
        if journal:
            record["journal_url"] = journal
        if arxiv:
            record["arxiv_url"] = arxiv
        return record
    return None


def research(person, provider):
    try:
        if provider == "crossref":
            paper = choose_crossref_work(person)
            return (person["id"], paper,
                    None if paper else "no confidently matched Crossref paper")
        author, reason = choose_author(person)
        if not author:
            return person["id"], None, reason
        paper = choose_work(author)
        if not paper:
            return person["id"], None, "no linked article-like work"
        paper["openalex_author"] = author["id"]
        return person["id"], paper, None
    except Exception as exc:  # keep one failed lookup from losing the full pass
        return person["id"], None, "%s: %s" % (type(exc).__name__, exc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--provider", choices=("openalex", "crossref"),
                        default="openalex")
    parser.add_argument("--replace", action="store_true",
                        help="refresh records that already have most_cited")
    parser.add_argument("--only", help="comma-separated genealogy IDs to query")
    parser.add_argument("--manual-only", action="store_true",
                        help="apply the hand-checked records without network requests")
    args = parser.parse_args()

    with open(GEN, encoding="utf-8") as source:
        people = json.load(source)
    for person in people:
        if person.get("most_cited", {}).get("title"):
            person["most_cited"]["title"] = clean_title(person["most_cited"]["title"])
        if person["id"] in BLOCKED_IDS:
            person.pop("most_cited", None)
        if person["id"] in MANUAL_PAPERS:
            paper = dict(MANUAL_PAPERS[person["id"]])
            paper.update({"source": "hand-checked bibliography",
                          "checked": datetime.date.today().isoformat()})
            person["most_cited"] = paper
    if args.manual_only:
        with open(GEN, "w", encoding="utf-8") as target:
            json.dump(people, target, ensure_ascii=False, indent=1)
            target.write("\n")
        print("Applied %d hand-checked paper records." % len(MANUAL_PAPERS))
        return
    only = set(args.only.split(",")) if args.only else None
    todo = [p for p in people if p["id"] not in BLOCKED_IDS
            and p["id"] not in MANUAL_PAPERS and (not only or p["id"] in only)
            and (args.replace or not p.get("most_cited"))]
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(research, person, args.provider): person for person in todo}
        for future in concurrent.futures.as_completed(futures):
            person = futures[future]
            person_id, paper, reason = future.result()
            results[person_id] = paper
            if paper:
                print("ok   %-32s %4s citations  %s" %
                      (person["name"][:32], paper["cited_by"], paper["title"]), flush=True)
            else:
                print("skip %-32s %s" % (person["name"][:32], reason), flush=True)

    added = 0
    for person in people:
        if results.get(person["id"]):
            person["most_cited"] = results[person["id"]]
            added += 1
    print("\n%d of %d queried people received a paper link." % (added, len(todo)))
    if args.dry_run:
        return
    with open(GEN, "w", encoding="utf-8") as target:
        json.dump(people, target, ensure_ascii=False, indent=1)
        target.write("\n")
    print("Wrote %s" % GEN)


if __name__ == "__main__":
    main()
