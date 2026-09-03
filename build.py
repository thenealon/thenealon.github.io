#!/usr/bin/env python3
"""Build thenealon.github.io.

    python3 build.py

Two pages: index.html carries the academic record, more.html carries
everything else.  Nothing here needs editing to change the site.

    data/site.json          page titles, mastheads, every section heading,
                            the contents labels, epigraphs, the colophon
    data/publications.json  papers and preprints
    data/talks.json         upcoming, research and outreach talks
    data/courses.json       what you are teaching, and what you have taught
    data/more.json          demos, exhibits, outreach, sessions, press
    data/genealogy.json     the advisor graph

A section's "block" names which generator fills it; its "intro" is a line of
prose printed under the heading, and is empty unless you write one.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


SITE = load("site.json")

# the running head in the margin always carries the full affiliation
AFFIL_RAIL = next(p["masthead"]["affiliation"] for p in SITE["pages"]
                  if p["masthead"].get("affiliation"))

# ------------------------------------------------------------------ shell

HEAD = """<!DOCTYPE html>
<html lang="en" data-bg="graph">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="assets/paper.css">
<script>try{{var g=localStorage.getItem('nb-bg');if(g){{document.documentElement.setAttribute('data-bg',g);}}}}catch(e){{}}</script>
<noscript><style>.controls{{display:none}}</style></noscript>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<canvas id="tidal-graph" aria-hidden="true"></canvas>

<div class="shell">

<nav class="rail" aria-label="Contents">
  <div class="rail-inner">
    <p class="who"><a href="index.html">Neal Bushaw</a></p>
{railwhere}
{portrait}
    <ol>
{contents}
    </ol>
    <div class="jump-wrap"><p class="jump"><a href="{jump_href}">{jump_label}</a><span class="gloss">{jump_gloss}</span></p></div>
  </div>
</nav>

<main id="main" class="column">
  <header class="masthead">
    <h1>{m_h1}</h1>
    <p class="role">{m_role}</p>
{m_affil}
    <p class="stamp">{stamp}</p>
  </header>

"""

FOOT = """  <footer class="colophon">
    <p>{colophon}</p>
  </footer>
</main>

</div><!-- /.shell -->

<div class="controls" role="group" aria-label="Background controls">
  <button type="button" class="ctl" id="bg-toggle"><span class="ctl-ico" aria-hidden="true">&#9638;</span><span class="ctl-txt">Percolation</span></button>
  <button type="button" class="ctl" id="speed-toggle"><span class="ctl-ico" aria-hidden="true">&#128034;</span><span class="ctl-txt">Slow</span></button>
  <button type="button" class="ctl" id="tide-toggle" aria-pressed="false"><span class="ctl-ico" aria-hidden="true">&#9646;&#9646;</span><span class="ctl-txt">Pause</span></button>
</div>

<dialog id="abstract-dialog" aria-labelledby="dlg-title">
  <div class="dlg-inner">
    <p class="dlg-title" id="dlg-title"></p>
    <p class="dlg-meta"></p>
    <div class="dlg-body"></div>
    <div class="dlg-foot">
      <span class="dlg-src"></span>
      <button type="button" class="tag" data-close>close</button>
    </div>
  </div>
</dialog>

<script src="assets/tidal-graph.js"></script>
<script src="assets/abstracts.js"></script>
<script src="assets/ui.js"></script>
{extra}</body>
</html>
"""


def wrap(sec, inner):
    """A section: heading, optional intro line from site.json, then content."""
    intro = ('    <p class="note">%s</p>\n' % sec["intro"]) if sec.get("intro") else ""
    return ('  <section class="section" id="%s" aria-labelledby="h-%s">\n'
            '    <h2 id="h-%s">%s</h2>\n%s%s  </section>\n\n'
            % (sec["id"], sec["id"], sec["id"], sec["heading"], intro, inner))


def fold(summary, inner):
    return ('    <details class="fold">\n      <summary>%s</summary>\n%s'
            '    </details>\n' % (summary, inner))


def epigraph(sec):
    e = sec.get("epigraph")
    if not e:
        return ""
    return ('    <blockquote class="epigraph">\n      <p>%s</p>\n'
            '      <cite>%s</cite>\n    </blockquote>\n' % (e["text"], e["cite"]))


def sub(sec, key, default=""):
    return sec.get("subheads", {}).get(key, default)


# ------------------------------------------------------------------ pieces

def links_for(pub):
    row = []
    if pub.get("arxiv"):
        row.append('<a class="tag tag--src" href="https://arxiv.org/abs/%s">arXiv</a>'
                   % pub["arxiv"])
    if pub.get("oa"):
        row.append('<a class="tag tag--src" href="%s">%s</a>'
                   % (pub["oa"], pub.get("oa_label", "full text")))
    row.append('<button type="button" class="tag" data-abstract="%s" hidden>'
               'abstract</button>' % pub["key"])
    return '      <div class="linkrow">\n        %s\n      </div>\n' % (
        "\n        ".join(row))


def biblio(pubs):
    out = ['    <ul class="biblio">\n']
    for pub in pubs:
        out.append('      <li>\n      <span class="authors">%s.</span> '
                   '<span class="title">%s.</span> '
                   '<span class="venue">%s</span>'
                   % (pub["authors"], pub["title"], pub["venue"]))
        if pub.get("note"):
            out.append(' <span class="remark">%s</span>' % pub["note"])
        out.append("\n" + links_for(pub) + "      </li>\n")
    out.append("    </ul>\n")
    return "".join(out)


def publication_views(pubs, topics):
    """Render one bibliography in chronological and thematic arrangements."""
    out = [
        '    <div class="pub-switcher" data-publication-switcher hidden '
        'role="group" aria-label="Arrange publications">\n',
        '      <span class="pub-switcher-label">Arrange</span>\n',
        '      <button type="button" class="pub-view-button is-active" '
        'data-publication-view="chronological" aria-pressed="true">'
        'Newest first</button>\n',
        '      <button type="button" class="pub-view-button" '
        'data-publication-view="thematic" aria-pressed="false">'
        'By topic</button>\n',
        '    </div>\n',
        '    <div class="pub-view" data-publication-panel="chronological">\n',
        biblio(pubs),
        '    </div>\n',
        '    <div class="pub-view pub-view--thematic" '
        'data-publication-panel="thematic" hidden>\n',
        '      <p class="note pub-view-note">Papers may appear in more than '
        'one section in this view.</p>\n',
    ]

    known = {topic["id"] for topic in topics}
    missing = [pub["key"] for pub in pubs if not pub.get("topics")]
    assigned = {topic_id for pub in pubs for topic_id in pub.get("topics", [])}
    unknown = sorted(assigned - known)
    if missing:
        raise ValueError("Publication(s) missing topics: %s" % ", ".join(missing))
    if unknown:
        raise ValueError("Unknown publication topic(s): %s" % ", ".join(unknown))

    for topic in topics:
        grouped = [pub for pub in pubs if topic["id"] in pub["topics"]]
        if not grouped:
            continue
        out.append('      <section class="pub-topic" aria-labelledby="pub-topic-%s">\n'
                   % topic["id"])
        out.append('        <h4 id="pub-topic-%s">%s</h4>\n'
                   % (topic["id"], topic["label"]))
        if topic.get("description"):
            out.append('        <p class="pub-topic-note">%s</p>\n'
                       % topic["description"])
        out.append(biblio(grouped))
        out.append('      </section>\n')
    out.append('    </div>\n')
    return "".join(out)


def entries(items, plain=False):
    cls = "entries entries--plain" if plain else "entries"
    out = ['    <ul class="%s">\n' % cls]
    for when, text in items:
        out.append("      <li>%s</li>\n" % text if plain else
                   '      <li><span class="when">%s</span>%s</li>\n' % (when, text))
    out.append("    </ul>\n")
    return "".join(out)


# ------------------------------------------------------------------ blocks

def block_overview(sec):
    return ('    <ul class="entries">\n'
            '      <li><span class="when">Teaching</span>MATH 300 and MATH 350, '
            'Fall 2026.</li>\n'
            '      <li><span class="when">Bridges 2026</span>'
            '<a href="bridges26.html">Cyclic Pianos</a> and '
            '<a href="seq.html">Cyclic Sequences</a>.</li>\n'
            '      <li><span class="when">Seminar</span>'
            '<a href="http://www.people.vcu.edu/~dcranston/DM-seminar/">VCU '
            'Discrete Math Seminar</a>.</li>\n'
            '      <li><span class="when">Email</span>'
            '<span class="email" data-user="nobushaw" data-domain="vcu.edu">'
            'nobushaw (at) vcu (dot) edu</span></li>\n'
            '      <li><span class="when">Office</span>'
            '<a href="https://maps.vcu.edu/monroepark/harrishall/">Grace E. '
            'Harris Hall</a> 4107</li>\n'
            '      <li><span class="when">Mail</span>Department of Mathematics '
            'and Statistics<br>Box 842014, 1015 Floyd Avenue<br>Richmond, '
            'Virginia 23284</li>\n'
            '    </ul>\n')


def block_research(sec):
    pubs = load("publications.json")
    talks = load("talks.json")
    out = [epigraph(sec)]
    out.append('    <p class="lede">My interests lie primarily within '
               'combinatorics, the area of mathematics which studies finite '
               'discrete structures. Recently, my research has focused on new '
               'aspects of the forbidden subgraph problem. However, I am also '
               'very interested in the use of probability in deterministic '
               'settings, as well as a wide variety of probabilistic and '
               'extremal questions on sets, graphs, and hypergraphs.</p>\n')
    out.append("    <h3>%s</h3>\n" % sub(sec, "upcoming"))
    out.append(entries([(w, t) for w, t, _ in talks["upcoming"]]))
    out.append("    <h3>%s</h3>\n" % sub(sec, "publications"))
    out.append(publication_views(pubs, sec["publicationTopics"]))
    out.append("    <h3>%s</h3>\n" % sub(sec, "talks"))
    note = ('    <p class="note">%s</p>\n' % sec["talksNote"]) if sec.get("talksNote") else ""
    out.append(fold(sub(sec, "talksFold"), note + entries(talks["talks"])))
    out.append(fold(sub(sec, "outreachFold"), entries(talks["outreach"])))
    return "".join(out)


AXIOMS = """    <p class="lede">I work from the axioms of Federico Ardila-Mantilla, as set
    out in <a href="https://dept.math.lsa.umich.edu/~glarose/dept/teaching/resources/ardila_federico_todos_cuentan.pdf"><i>Todos
    Cuentan</i></a>, Notices of the AMS <b>63</b> (2016), 1164&ndash;1170.</p>
    <ol class="axioms">
      <li>Mathematical talent is distributed equally among different groups,
      irrespective of geographic, demographic, and economic boundaries.</li>
      <li>Everyone can have joyful, meaningful, and empowering mathematical
      experiences.</li>
      <li>Mathematics is a powerful, malleable tool that can be shaped and used
      differently by various communities to serve their needs.</li>
      <li>Every student deserves to be treated with dignity and respect.</li>
    </ol>
    <p class="note">If you are in one of my classes, my office, or a seminar I
    am running, those four lines are the whole of the house style. Anyone who
    wants to do mathematics is welcome to do mathematics with me.</p>
"""


def block_teaching(sec):
    data = load("courses.json")
    cur = data["current"]
    out = [epigraph(sec), AXIOMS,
           "    <h3>%s</h3>\n" % cur["term"], '    <ul class="courses">\n']
    for c in cur["courses"]:
        out.append('      <li><span class="cnum">%s</span> '
                   '<span class="ctitle">%s</span><br>'
                   '<span class="cterms">%s</span></li>\n'
                   % (c["number"], c["title"], c["detail"]))
    out.append("    </ul>\n")
    if cur.get("note"):
        out.append('    <p class="note">%s</p>\n' % cur["note"])

    body = []
    for inst in data["institutions"]:
        body.append('    <h3>%s</h3>\n    <ul class="courses">\n' % inst["name"])
        for c in inst["courses"]:
            num = ('<span class="cnum">%s</span> ' % c["number"]) if c["number"] else ""
            title = ('<span class="ctitle">%s</span><br>' % c["title"]
                     if c["title"] else "")
            body.append('      <li>%s%s<span class="cterms">%s</span>'
                        % (num, title, c["terms"]))
            if c["desc"]:
                body.append('<div class="cdesc">%s</div>' % c["desc"])
            body.append("</li>\n")
        body.append("    </ul>\n")
    out.append(fold(sub(sec, "historyFold"), "".join(body)))
    return "".join(out)


def block_who(sec):
    return WHO


def block_items(sec):
    items = [i for i in load("more.json")
             if i.get("kind") == sec["kind"] and not i.get("draft")]
    out = ['    <ul class="biblio">\n']
    for i in items:
        name = ('<a href="%s">%s</a>' % (i["href"], i["name"])) if i.get("href") \
               else i["name"]
        out.append('      <li>\n      <span class="title">%s</span>' % name)
        if i.get("when"):
            out.append(' <span class="cterms">(%s)</span>' % i["when"])
        if i.get("meta"):
            out.append('<br><span class="cterms">%s</span>' % i["meta"])
        out.append("\n")
        if i.get("what"):
            out.append('      <div class="cdesc">%s</div>\n' % i["what"])
        out.append("      </li>\n")
    out.append("    </ul>\n")
    return "".join(out)


def block_genealogy(sec):
    return """    <div class="gen-wrap">
      <div id="gen-graph"></div>
      <aside id="gen-panel" aria-live="polite"></aside>
    </div>
    <div class="linkrow">
      <button type="button" class="tag" id="gen-sibs">hide siblings</button>
      <button type="button" class="tag" id="gen-reset">back to me</button>
      <button type="button" class="tag" id="gen-fit">fit all</button>
      <button type="button" class="tag" id="gen-out">zoom out</button>
      <button type="button" class="tag" id="gen-in">zoom in</button>
    </div>
"""


LINK_GROUPS = [
    ("Open source mathematics", [
        ("SageMath", "https://www.sagemath.org",
         "the free open-source mathematics system."),
        ("CONJECTURING", "http://nvcleemp.github.io/conjecturing/",
         "Nico Van Cleemput and Craig Larson's automated conjecturing program "
         "for Sage."),
        ("OIP-GT", "http://math1um.github.io/objects-invariants-properties/",
         "Craig Larson's Objects, Invariants and Properties for Graph Theory."),
    ]),
    ("Where I've studied and taught", [
        ("Silver Ridge Elementary School", "https://silverridge.ckschools.org/",
         "Silverdale WA."),
        ("Central Kitsap Junior High School", "https://ckmiddle.ckschools.org/",
         "Silverdale WA; now Central Kitsap Middle School."),
        ("Central Kitsap High School", "https://ckhigh.ckschools.org/",
         "Silverdale WA."),
        ("University of Colorado", "http://math.colorado.edu", "Boulder CO."),
        ("University of Waikato", "https://www.waikato.ac.nz",
         "Hamilton, New Zealand."),
        ("Western Washington University", "http://www.wwu.edu/math",
         "Bellingham WA."),
        ("University of Memphis", "http://www.msci.memphis.edu", "Memphis TN."),
        ("Instituto Nacional de Matem&aacute;tica Pura e Aplicada",
         "http://www.impa.br", "Rio de Janeiro."),
        ("Arizona State University", "http://math.asu.edu", "Tempe AZ."),
        ("University of Vermont", "https://www.uvm.edu/cems/mathstat",
         "Burlington VT."),
        ("Virginia Commonwealth University", "http://math.vcu.edu",
         "Richmond VA."),
    ]),
]


def block_links(sec):
    out = []
    for heading, items in LINK_GROUPS:
        out.append("    <h3>%s</h3>\n" % heading)
        out.append(entries([("", '<a href="%s">%s</a>%s'
                             % (u, n, " " + g if g else ""))
                            for n, u, g in items], plain=True))
    return "".join(out)


WHO = """    <p class="lede">I'm an Associate Professor in the
    <a href="http://math.vcu.edu">Department of Mathematics and Statistics</a>
    at <a href="http://www.vcu.edu">Virginia Commonwealth University</a>.</p>
    <p>Before that, I was a Visiting Assistant Professor at
    <a href="http://www.asu.edu">Arizona State University</a>, and a research
    postdoc at <a href="http://www.impa.br">Instituto Nacional de
    Matem&aacute;tica Pura e Aplicada</a> in Rio de Janeiro. I completed my
    doctorate under the supervision of Prof. B&eacute;la Bollob&aacute;s at the
    <a href="http://www.memphis.edu">University of Memphis</a> in May 2012;
    this followed an M.S. at
    <a href="http://math.wwu.edu/">Western Washington University</a> under the
    supervision of Dr. Amites Sarkar, and a B.A. at
    <a href="http://www.colorado.edu">the University of Colorado</a>. I am
    greatly indebted to all my teachers and to those around me who have helped
    me throughout my academic career, although I attempt no comprehensive list
    here. The <a href="more.html#genealogy">advisor graph</a> is the closest
    thing to one.</p>
    <p>My academic interests lie primarily in the mysteries and details of
    mathematics, particularly extremal and probabilistic combinatorics. Outside
    academia, I enjoy <a href="http://en.wikipedia.org/wiki/Avant-garde_jazz">weird</a>
    <a href="http://en.wikipedia.org/wiki/Eric_Dolphy">jazz</a>,
    <a href="http://en.wikipedia.org/wiki/Hardcore_punk">loud</a>
    <a href="http://en.wikipedia.org/wiki/Skate_punk">punk</a>
    <a href="http://en.wikipedia.org/wiki/Refused">rock</a>,
    <a href="http://www.fender.com">gui</a><a href="http://www.mguitar.com">tars</a>,
    <a href="http://www.freeskier.com">skiing</a>,
    <a href="http://www.stevenspass.com">snowboarding</a>, as well as life, the
    universe, and everything.</p>
    <ul class="entries">
      <li><span class="when">VCU</span><a href="https://math.vcu.edu/directory/bushaw.html">My
      official department profile</a>.</li>
      <li><span class="when">ORCID</span><a href="https://orcid.org/0000-0003-2441-5713">0000-0003-2441-5713</a></li>
      <li><span class="when">Profiles</span><a href="https://scholar.google.com/citations?user=8Oyig08AAAAJ">Google Scholar</a>
      &middot; <a href="https://arxiv.org/a/bushaw_n_1">arXiv</a>
      &middot; <a href="https://dblp.org/pid/95/10545.html">dblp</a>
      &middot; <a href="https://www.ams.org/mathscinet/search/author.html?mrauthid=956367">MathSciNet</a>
      &middot; <a href="https://www.mathgenealogy.org/id.php?id=163297">genealogy project</a></li>
      <li><span class="when">Code</span><a href="https://github.com/thenealon">github.com/thenealon</a>,
      including the source of this site.</li>
      <li><span class="when">Family</span><a href="http://www.ams.org/mathscinet/search/author.html?mrauthid=420315">Donald
      &ldquo;Beh&rdquo; Bushaw</a> &mdash; my illustrious grandfather, on MathSciNet.</li>
      <li><span class="when">Pledges</span><a href="https://tcs4f.org">Theoretical
      Computer Scientists for Future</a></li>
      <li><span class="when">On AI</span><a href="https://leidendeclaration.ai/">The
      Leiden Declaration on Artificial Intelligence and Mathematics</a>, endorsed by
      the International Mathematical Union.</li>
    </ul>
"""


# ------------------------------------------------------------------ gallery
#
# The gallery scans the apps/ folder at build time.  Drop a self-contained
# .html file in there and it appears here on the next build, with its name
# taken from the file's <title>.  Put a matching screenshot at
# assets/demos/<filename>.jpg; otherwise the build supplies a stable random
# geometric graph motif as a fallback.

import glob
import re as _re


def _title_of(path):
    """The <title> of an app file, or a tidied filename if it has none."""
    try:
        with open(path, encoding="utf-8") as f:
            head = f.read(4000)
    except OSError:
        head = ""
    m = _re.search(r"<title[^>]*>(.*?)</title>", head, _re.I | _re.S)
    if m and m.group(1).strip():
        return _re.sub(r"\\s+", " ", m.group(1)).strip()
    stem = os.path.splitext(os.path.basename(path))[0]
    return stem.replace("-", " ").replace("_", " ").strip().title()


def _seed(s):
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xffffffff
    return h


def _rng(seed):
    st = [seed & 0xffffffff]
    def rnd():
        st[0] = (st[0] + 0x6D2B79F5) & 0xffffffff
        t = st[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff))) & 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296.0
    return rnd


def _thumb(name):
    """An inline-SVG random geometric graph seeded from the app's name."""
    W, H, pad = 320, 176, 22
    rnd = _rng(_seed(name))
    n = 10 + int(rnd() * 4)                 # 10-13 vertices
    pts = [(pad + rnd() * (W - 2 * pad), pad + rnd() * (H - 2 * pad))
           for _ in range(n)]
    r = 96                                   # connection radius
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            dx, dy = pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]
            if dx * dx + dy * dy < r * r:
                edges.append((i, j))
    parts = ['<svg class="thumb" viewBox="0 0 %d %d" role="img" '
             'aria-label="Abstract graph motif" focusable="false">' % (W, H)]
    for i, j in edges:
        parts.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                     % (pts[i][0], pts[i][1], pts[j][0], pts[j][1]))
    for x, y in pts:
        parts.append('<circle cx="%.1f" cy="%.1f" r="2.6"/>' % (x, y))
    parts.append('</svg>')
    return "".join(parts)


def _preview(title, src=""):
    """A real screenshot when one is available, with the graph as fallback."""
    if src:
        return ('<img class="thumb" src="%s" alt="Preview of %s" '
                'width="320" height="176" loading="lazy" decoding="async">'
                % (src, title))
    return _thumb(title)


def block_gallery(sec):
    demos = [i for i in load("more.json")
             if i.get("kind") == "demo" and not i.get("draft")]
    demo_hrefs = {i.get("href") for i in demos if i.get("href")}
    files = sorted(glob.glob(os.path.join(HERE, "apps", "*.html")))
    files = [f for f in files
             if os.path.basename(f).lower() not in ("index.html",)
             and "apps/" + os.path.basename(f) not in demo_hrefs]
    cards = []
    for demo in demos:
        href = demo.get("href")
        title = demo.get("name")
        if not href or not title:
            continue
        cards.append(
            '      <li><a class="app" href="%s">\n'
            '        %s\n'
            '        <span class="app-name">%s</span>\n'
            '      </a></li>\n'
            % (href, _preview(title, demo.get("thumbnail", "")), title))
    if not files and not cards:
        return ('    <p class="note">Nothing here yet. Drop a self-contained '
                '<code>.html</code> file into the <code>apps/</code> folder and '
                'it will appear here automatically.</p>\n')
    for path in files:
        href = "apps/" + os.path.basename(path)
        title = _title_of(path)
        preview = "assets/demos/%s.jpg" % os.path.splitext(os.path.basename(path))[0]
        if not os.path.exists(os.path.join(HERE, preview)):
            preview = ""
        cards.append(
            '      <li><a class="app" href="%s">\n'
            '        %s\n'
            '        <span class="app-name">%s</span>\n'
            '      </a></li>\n' % (href, _preview(title, preview), title))
    return ('    <ul class="gallery">\n' + "".join(cards) +
            '    </ul>\n')



BLOCKS = {
    "overview": block_overview, "research": block_research,
    "teaching": block_teaching, "who": block_who, "items": block_items,
    "genealogy": block_genealogy, "links": block_links,
    "gallery": block_gallery,
}


# ------------------------------------------------------------------ render

def render(pg):
    secs = pg["sections"]
    contents = "\n".join(
        '      <li><a href="#%s">%s</a></li>' % (s["id"], s["rail"]) for s in secs)
    body = "".join(wrap(s, BLOCKS[s["block"]](s)) for s in secs)
    extra = ('<script src="assets/genealogy-data.js"></script>\n'
             '<script src="assets/genealogy.js"></script>\n'
             if any(s["block"] == "genealogy" for s in secs) else "")
    m = pg["masthead"]
    aff = m.get("affiliation") or []
    m_affil = "".join('    <p class="affil"><a href="%s">%s</a></p>\n'
                      % (a["href"], a["text"]) for a in aff)
    if not aff and m.get("dept"):
        m_affil = '    <p class="affil">%s</p>\n' % m["dept"]
    railwhere = ('    <p class="where">'
                 + '<br>'.join('<a href="%s">%s</a>' % (a["href"], a["text"])
                               for a in AFFIL_RAIL)
                 + '</p>')
    por = SITE.get("portrait")
    portrait = ('    <img class="plate" src="%s" alt="%s" width="400" height="300"\n'
                '         loading="lazy" decoding="async">\n'
                % (por["src"], por["alt"])) if por else ""
    out = HEAD.format(title=pg["title"], desc=pg["description"], portrait=portrait,
                      contents=contents, jump_href=pg["jump"]["href"],
                      jump_label=pg["jump"]["label"], jump_gloss=pg["jump"]["gloss"],
                      m_h1=m["h1"], m_role=m["role"], m_affil=m_affil,
                      railwhere=railwhere, stamp=SITE["stamp"])
    out += body + FOOT.format(colophon=SITE["colophon"], extra=extra)
    with open(os.path.join(HERE, pg["file"]), "w", encoding="utf-8") as f:
        f.write(out)
    print("wrote %s (%d sections)" % (pg["file"], len(secs)))


for pg in SITE["pages"]:
    render(pg)

data = load("genealogy.json")
with open(os.path.join(HERE, "assets", "genealogy-data.js"), "w",
          encoding="utf-8") as f:
    f.write("/*! generated by build.py from data/genealogy.json. */\n")
    f.write("window.GENEALOGY = ")
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write(";\n")
print("wrote assets/genealogy-data.js (%d people)" % len(data))
