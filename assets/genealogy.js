/*! genealogy.js -- the advisor graph, drawn as a layered DAG.
 *
 *  Data comes from data/genealogy.json, emitted by build.py as
 *  assets/genealogy-data.js so that the page also works from file://.
 *  Relationships are advisor -> student, taken from the Mathematics
 *  Genealogy Project.  It is a graph and not a tree: Bollobas took two
 *  doctorates and so has three advisors, Schwarz had two, and Erdos and
 *  Fejes Toth were both students of Fejer, which closes a diamond.
 *
 *  Stored portrait URLs are painted when the graph opens.  A missing portrait
 *  is requested from Wikipedia only when that person is selected; if the
 *  request fails, the node keeps its initials and everything still works.
 */
(function () {
  'use strict';

  var people = window.GENEALOGY;
  var root = document.getElementById('gen-graph');
  if (!people || !root) { return; }

  var SVGNS = 'http://www.w3.org/2000/svg';
  var NODE_W = 168, NODE_H = 40, GAP_X = 16, GAP_Y = 58, PAD = 26;
  var DOT_R = 11, DOT_GAP = 7, DOT_PER_ROW = 14;  /* the sibling block */
  var showSibs = true;

  var byId = {}, i, j, d;
  for (i = 0; i < people.length; i++) { byId[people[i].id] = people[i]; }

  /* ---- children, and the depth of each node above the root ---------- */
  for (i = 0; i < people.length; i++) { people[i].kids = []; }
  for (i = 0; i < people.length; i++) {
    var adv = people[i].advisors || [];
    for (j = 0; j < adv.length; j++) {
      if (byId[adv[j]]) { byId[adv[j]].kids.push(people[i].id); }
    }
  }

  /* Generation, measured from me: an advisor is one above, a student one
     below.  A longest-path depth would put a sibling who has students on the
     same row as our shared advisor, which is wrong and looks it.        */
  var ME = null;
  for (i = 0; i < people.length; i++) { if (people[i].me) { ME = people[i]; } }
  if (!ME) { ME = people[0]; }

  var q = [ME.id];
  ME.gen = 0;
  while (q.length) {
    var cur = byId[q.shift()];
    var up = cur.advisors || [], dn = cur.kids;
    for (j = 0; j < up.length; j++) {
      var a = byId[up[j]];
      if (a && a.gen === undefined) { a.gen = cur.gen + 1; q.push(a.id); }
    }
    for (j = 0; j < dn.length; j++) {
      var kd = byId[dn[j]];
      if (kd && kd.gen === undefined) { kd.gen = cur.gen - 1; q.push(kd.id); }
    }
  }
  /* the direct line is me and everyone above me; everyone else is a dot */
  ME.line = true;
  var lineQ = [ME.id];
  while (lineQ.length) {
    var lc = byId[lineQ.shift()];
    var la = lc.advisors || [];
    for (j = 0; j < la.length; j++) {
      var lp = byId[la[j]];
      if (lp && !lp.line) { lp.line = true; lineQ.push(lp.id); }
    }
  }

  var minGen = 0, maxGen = 0;
  for (i = 0; i < people.length; i++) {
    if (people[i].gen === undefined) { people[i].gen = 0; }
    if (people[i].gen < minGen) { minGen = people[i].gen; }
    if (people[i].gen > maxGen) { maxGen = people[i].gen; }
  }
  for (i = 0; i < people.length; i++) { people[i].depth = people[i].gen - minGen; }
  var maxDepth = maxGen - minGen;

  var layers = [];
  for (i = 0; i < people.length; i++) {
    (layers[people[i].depth] = layers[people[i].depth] || []).push(people[i]);
  }
  for (d = 0; d <= maxDepth; d++) { layers[d] = layers[d] || []; }

  /* ---- coordinates --------------------------------------------------
     The direct line gets one labelled row per generation.  Everyone else --
     seventy-two academic siblings -- is a block of small circles, which can
     be folded away entirely.                                            */
  var rows, dots, W, H;

  function layout() {
    rows = [];
    dots = [];
    for (d = maxDepth; d >= 0; d--) {
      var L = layers[d] || [];
      var line = [], rest = [];
      for (i = 0; i < L.length; i++) {
        (L[i].line ? line : rest).push(L[i]);
      }
      if (line.length) { rows.push(line); }
      if (rest.length && showSibs) { dots = dots.concat(rest); }
    }

    var lineW = 0;
    for (i = 0; i < rows.length; i++) {
      var w = rows[i].length * (NODE_W + GAP_X) - GAP_X;
      if (w > lineW) { lineW = w; }
    }
    var dotRows = Math.ceil(dots.length / DOT_PER_ROW);
    var dotW = Math.min(dots.length, DOT_PER_ROW) * (2 * DOT_R + DOT_GAP) - DOT_GAP;

    var innerW = Math.max(lineW, dotW);
    W = innerW + 2 * PAD;
    H = rows.length * (NODE_H + GAP_Y) - GAP_Y + 2 * PAD
        + (dotRows ? dotRows * (2 * DOT_R + DOT_GAP) + GAP_Y : 0);

    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var rw = row.length * (NODE_W + GAP_X) - GAP_X;
      var x0 = PAD + (innerW - rw) / 2;
      var y = PAD + i * (NODE_H + GAP_Y);
      for (j = 0; j < row.length; j++) {
        row[j].x = x0 + j * (NODE_W + GAP_X);
        row[j].y = y;
        row[j].dot = false;
      }
    }

    var top = PAD + rows.length * (NODE_H + GAP_Y);
    for (i = 0; i < dots.length; i++) {
      var rr = (i / DOT_PER_ROW) | 0;
      var cc = i % DOT_PER_ROW;
      var inRow = Math.min(dots.length - rr * DOT_PER_ROW, DOT_PER_ROW);
      var rowWid = inRow * (2 * DOT_R + DOT_GAP) - DOT_GAP;
      dots[i].x = PAD + (innerW - rowWid) / 2 + cc * (2 * DOT_R + DOT_GAP);
      dots[i].y = top + rr * (2 * DOT_R + DOT_GAP);
      dots[i].dot = true;
    }
  }

  layout();

  /* ---- svg ---------------------------------------------------------- */
  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  function initials(name) {
    var parts = name.replace(/[^A-Za-z\s\u00C0-\u024F]/g, '').split(/\s+/)
                    .filter(Boolean);
    if (!parts.length) { return '?'; }
    return (parts[0].charAt(0) +
            (parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''))
           .toUpperCase();
  }

  var svg = el('svg', { role: 'img',
    'aria-label': 'Advisor graph, ' + people.length + ' mathematicians' });
  var gEdges = el('g'), gNodes = el('g');
  svg.appendChild(gEdges);
  svg.appendChild(gNodes);
  root.appendChild(svg);

  var edgeEls = [], nodeEls = {};

  function drawn(p) { return !p.dot || showSibs; }

  function render() {
    while (gEdges.firstChild) { gEdges.removeChild(gEdges.firstChild); }
    while (gNodes.firstChild) { gNodes.removeChild(gNodes.firstChild); }
    edgeEls = [];
    nodeEls = {};

    var visible = {};
    for (var a = 0; a < people.length; a++) {
      if (people[a].line || (showSibs && people[a].dot !== false)) {
        visible[people[a].id] = 1;
      }
    }
    /* a person laid out as a dot is only visible when siblings are shown */
    for (a = 0; a < people.length; a++) {
      visible[people[a].id] = people[a].line || showSibs;
    }

    var i, j;
    for (i = 0; i < people.length; i++) {
      var p = people[i];
      if (!visible[p.id]) { continue; }
      var ad = p.advisors || [];
      for (j = 0; j < ad.length; j++) {
        var av = byId[ad[j]];
        if (!av || !visible[av.id]) { continue; }
        var x1 = av.x + (av.line ? NODE_W / 2 : 0);
        var y1 = av.y + (av.line ? NODE_H : DOT_R);
        var x2 = p.x + (p.line ? NODE_W / 2 : 0);
        var y2 = p.y + (p.line ? 0 : -DOT_R);
        var my = (y1 + y2) / 2;
        var path = el('path', {
          d: 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + my + ' ' + x2 + ',' + my +
             ' ' + x2 + ',' + y2,
          'class': 'gen-edge'
        });
        path.__from = av.id;
        path.__to = p.id;
        gEdges.appendChild(path);
        edgeEls.push(path);
      }
    }

    for (i = 0; i < people.length; i++) {
      (function (p) {
        if (!visible[p.id]) { return; }
        var cls = 'gen-node' + (p.me ? ' is-me' : '') +
                  (p.coauthor ? ' is-coauthor' : '') +
                  (p.line ? ' is-line' : ' is-dot');
        var g = el('g', { 'class': cls, tabindex: '0', role: 'button',
                          'aria-label': p.name });

        if (p.line) {
          g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
          g.appendChild(el('rect', { width: NODE_W, height: NODE_H, rx: 3,
                                     'class': 'gen-box' }));
          var clipId = 'clip-' + p.id;
          var clip = el('clipPath', { id: clipId });
          clip.appendChild(el('circle', { cx: 20, cy: NODE_H / 2, r: 13 }));
          g.appendChild(clip);
          g.appendChild(el('circle', { cx: 20, cy: NODE_H / 2, r: 13,
                                       'class': 'gen-avatar' }));
          var ini = el('text', { x: 20, y: NODE_H / 2, 'class': 'gen-initials',
            'text-anchor': 'middle', 'dominant-baseline': 'central' });
          ini.textContent = initials(p.name);
          g.appendChild(ini);

          var sub = p.life || (p.year ? String(p.year) : '');
          var nm = el('text', { x: 40, y: sub ? 18 : NODE_H / 2 + 1,
                                'class': 'gen-name' });
          nm.textContent = p.name.length > 24 ? p.name.slice(0, 23) + '\u2026'
                                              : p.name;
          g.appendChild(nm);
          if (sub) {
            var yr = el('text', { x: 40, y: 30, 'class': 'gen-years' });
            yr.textContent = sub;
            g.appendChild(yr);
          }
          nodeEls[p.id] = { g: g, clipId: clipId, ini: ini, person: p };
        } else {
          g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
          var cid = 'clip-' + p.id;
          var cp = el('clipPath', { id: cid });
          cp.appendChild(el('circle', { cx: 0, cy: 0, r: DOT_R }));
          g.appendChild(cp);
          g.appendChild(el('circle', { r: DOT_R, 'class': 'gen-dot' }));
          var di = el('text', { x: 0, y: 0, 'class': 'gen-dot-initials',
            'text-anchor': 'middle', 'dominant-baseline': 'central' });
          di.textContent = initials(p.name);
          g.appendChild(di);
          var t = el('title');
          t.textContent = p.name + (p.year ? ', ' + p.year : '');
          g.appendChild(t);
          nodeEls[p.id] = { g: g, clipId: cid, ini: di, person: p };
        }

        g.addEventListener('click', function () { select(p.id); });
        g.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.id); }
        });
        gNodes.appendChild(g);
      }(people[i]));
    }
  }

  render();

  /* ---- selection: light the paths from this person down to Neal ----- */
  var panel = document.getElementById('gen-panel');
  var selectedId = null;

  function descendants(id) {
    var out = {}, stack = [id];
    while (stack.length) {
      var cur = stack.pop();
      if (out[cur]) { continue; }
      out[cur] = 1;
      var kids = byId[cur] ? byId[cur].kids : [];
      for (var k = 0; k < kids.length; k++) { stack.push(kids[k]); }
    }
    return out;
  }

  /* Only vertices lying on a directed path to me should light up. */
  function ancestors(id) {
    var out = {}, stack = [id];
    while (stack.length) {
      var cur = stack.pop();
      if (out[cur]) { continue; }
      out[cur] = 1;
      var advisors = byId[cur] ? (byId[cur].advisors || []) : [];
      for (var k = 0; k < advisors.length; k++) { stack.push(advisors[k]); }
    }
    return out;
  }

  var reachesMe = ancestors(ME.id);

  function select(id) {
    var below = descendants(id), lit = {};
    var k;
    for (k in below) {
      if (Object.prototype.hasOwnProperty.call(below, k) && reachesMe[k]) {
        lit[k] = 1;
      }
    }
    for (k in nodeEls) {
      if (Object.prototype.hasOwnProperty.call(nodeEls, k)) {
        nodeEls[k].g.classList.toggle('is-lit', !!lit[k]);
        nodeEls[k].g.classList.toggle('is-sel', k === id);
      }
    }
    selectedId = id;
    for (k = 0; k < edgeEls.length; k++) {
      var e = edgeEls[k];
      e.classList.toggle('is-lit', !!(lit[e.__from] && lit[e.__to]));
    }
    showPanel(byId[id]);
  }

  function link(href, label) {
    var a = document.createElement('a');
    a.className = 'tag';
    a.href = href;
    a.rel = 'noopener';
    a.textContent = label;
    return a;
  }

  function para(cls, text) {
    var p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    return p;
  }

  function relation(label, names) {
    var p = document.createElement('p');
    p.className = 'gen-prel';
    var span = document.createElement('span');
    span.textContent = label;
    p.appendChild(span);
    p.appendChild(document.createTextNode(' ' + names.join(', ')));
    return p;
  }

  function showPanel(p) {
    if (!panel) { return; }
    var meta = [];
    if (p.life) { meta.push(p.life); }
    if (p.year) { meta.push('doctorate ' + p.year); }
    if (p.inst) { meta.push(p.inst); }
    if (p.descendants) {
      meta.push(p.descendants + ' descendant' + (p.descendants === 1 ? '' : 's'));
    }

    var kids = [];
    for (var k = 0; k < p.kids.length; k++) {
      if (byId[p.kids[k]]) { kids.push(byId[p.kids[k]].name); }
    }
    var adv = [];
    for (k = 0; k < (p.advisors || []).length; k++) {
      if (byId[p.advisors[k]]) { adv.push(byId[p.advisors[k]].name); }
    }

    var links = [];
    if (p.website) {
      links.push(link(p.website, 'website'));
    }
    if (p.most_cited) {
      var paperUrl = p.most_cited.journal_url || p.most_cited.arxiv_url;
      if (paperUrl) {
        var paperLink = link(paperUrl, 'most-cited paper');
        if (p.most_cited.title) {
          paperLink.title = p.most_cited.title;
          paperLink.setAttribute('aria-label', 'Most-cited paper: ' +
                                 p.most_cited.title);
        }
        links.push(paperLink);
      }
    }
    if (p.wiki) {
      links.push(link('https://en.wikipedia.org/wiki/' +
        encodeURIComponent(p.wiki.replace(/ /g, '_')), 'wikipedia'));
    }
    if (p.mgp) {
      links.push(link('https://www.mathgenealogy.org/id.php?id=' + p.mgp,
        'genealogy project'));
    }
    if (p.mactutor) {
      links.push(link('https://mathshistory.st-andrews.ac.uk/Biographies/' +
        p.mactutor + '/', 'mactutor'));
    }

    panel.textContent = '';
    var portraitBox = document.createElement('div');
    portraitBox.className = 'gen-portrait';
    portraitBox.id = 'gen-portrait';
    var portraitInitials = document.createElement('span');
    portraitInitials.textContent = initials(p.name);
    portraitBox.appendChild(portraitInitials);
    panel.appendChild(portraitBox);
    panel.appendChild(para('gen-pname', p.name));
    if (meta.length) { panel.appendChild(para('gen-pmeta', meta.join(' · '))); }
    if (p.thesis) {
      var thesis = document.createElement('p');
      thesis.className = 'gen-pthesis';
      var thesisLabel = document.createElement('span');
      thesisLabel.textContent = 'thesis';
      var thesisTitle = document.createElement('i');
      thesisTitle.textContent = p.thesis;
      thesis.appendChild(thesisLabel);
      thesis.appendChild(document.createTextNode(' '));
      thesis.appendChild(thesisTitle);
      panel.appendChild(thesis);
    }
    if (adv.length) { panel.appendChild(relation('advised by', adv)); }
    if (kids.length) { panel.appendChild(relation('advised', kids)); }
    if (p.note) { panel.appendChild(para('gen-pnote', p.note)); }
    if (p.photo && p.photo_credit) {
      links.push(link(p.photo_credit, 'portrait credit'));
    }
    if (links.length) {
      var linkrow = document.createElement('div');
      linkrow.className = 'linkrow';
      for (k = 0; k < links.length; k++) { linkrow.appendChild(links[k]); }
      panel.appendChild(linkrow);
    }
    if (p.wiki) { portrait(p, portraitBox); }
  }

  /* ---- portraits, fetched lazily from Wikipedia --------------------- */
  var cache = {};

  function portrait(p, box) {
    if (!box) { return; }
    /* resolved by fetch_portraits.py: no network request, works anywhere */
    if (p.photo) { paint(box, p.photo); badge(p.id, p.photo); return; }
    if (!window.fetch) { return; }
    if (cache[p.id] === null) { return; }
    if (cache[p.id]) { paint(box, cache[p.id]); return; }

    fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' +
          encodeURIComponent(p.wiki.replace(/ /g, '_')))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var src = d && d.thumbnail && d.thumbnail.source;
        cache[p.id] = src || null;
        if (src) {
          paint(box, src);
          badge(p.id, src);
        }
      })
      .catch(function () { cache[p.id] = null; });
  }

  function paint(box, src) {
    if (!box) { return; }
    var img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.addEventListener('load', function () {
      box.textContent = '';
      box.appendChild(img);
    });
  }

  /* once a portrait is known, use it in the graph node too */
  function badge(id, src) {
    var n = nodeEls[id];
    if (!n || n.imaged) { return; }
    n.imaged = true;
    var im = el('image', {
      x: 7, y: NODE_H / 2 - 12, width: 24, height: 24,
      preserveAspectRatio: 'xMidYMid slice',
      'clip-path': 'url(#' + n.clipId + ')',
      'class': 'gen-photo'
    });
    im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
    im.setAttribute('href', src);
    n.g.insertBefore(im, n.ini);
    n.ini.style.display = 'none';
  }

  /* Paint the portraits resolved by the maintenance script. */
  for (var pp = 0; pp < people.length; pp++) {
    if (people[pp].photo) { badge(people[pp].id, people[pp].photo); }
  }

  /* ---- pan and zoom --------------------------------------------------
     The viewBox is kept equal to the element's pixel size, so one unit is
     one CSS pixel and the labels are readable at scale 1.  Fitting the whole
     graph into the box instead would shrink 30 nodes to illegibility, so the
     default view is close in on me and you zoom out to see the rest.      */
  var scale = 1, tx = 0, ty = 0, dragging = false, lx = 0, ly = 0;
  var VW = 800, VH = 600;

  function sizeView() {
    var r = root.getBoundingClientRect();
    VW = Math.max(200, r.width);
    VH = Math.max(200, r.height);
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  }

  function apply() {
    gEdges.setAttribute('transform',
      'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
    gNodes.setAttribute('transform',
      'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
  }

  function fitAll() {
    sizeView();
    scale = Math.min(VW / W, VH / H) * 0.94;
    tx = (VW - W * scale) / 2;
    ty = (VH - H * scale) / 2;
    apply();
  }

  function focusOn(id, s, vfrac) {
    sizeView();
    var p = byId[id];
    if (!p) { return; }
    scale = s || 1;
    tx = VW / 2 - (p.x + NODE_W / 2) * scale;
    ty = VH * (vfrac === undefined ? 0.62 : vfrac) - (p.y + NODE_H / 2) * scale;
    apply();
  }

  window.addEventListener('resize', function () { sizeView(); apply(); });

  root.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.gen-node')) { return; }
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
  });
  root.addEventListener('pointermove', function (e) {
    if (!dragging) { return; }
    var f = VW / root.clientWidth;
    tx += (e.clientX - lx) * f;
    ty += (e.clientY - ly) * f;
    lx = e.clientX;
    ly = e.clientY;
    apply();
  });
  function endDrag() {
    dragging = false;
    root.classList.remove('is-dragging');
  }
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('lostpointercapture', endDrag);
  root.addEventListener('wheel', function (e) {
    e.preventDefault();
    var f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    var next = Math.min(4, Math.max(0.4, scale * f));
    f = next / scale;
    var r = root.getBoundingClientRect();
    var mx = (e.clientX - r.left) * (VW / r.width);
    var my = (e.clientY - r.top) * (VW / r.width);
    tx = mx - (mx - tx) * f;
    ty = my - (my - ty) * f;
    scale = next;
    apply();
  }, { passive: false });

  function bind(id, fn) {
    var b = document.getElementById(id);
    if (b) { b.addEventListener('click', fn); }
  }
  var sibBtn = document.getElementById('gen-sibs');
  function labelSibs() {
    if (sibBtn) {
      sibBtn.textContent = (showSibs ? 'hide' : 'show') + ' siblings';
    }
  }
  labelSibs();
  bind('gen-sibs', function () {
    showSibs = !showSibs;
    labelSibs();
    layout();
    render();
    if (selectedId && !byId[selectedId].line && !showSibs) { select('bushaw'); }
    else { select(selectedId || 'bushaw'); }
    focusOn('bushaw', 1, 0.62);
  });
  bind('gen-reset', function () { select('bushaw'); focusOn('bushaw', 1, 0.62); });
  bind('gen-fit', fitAll);
  function zoomAtCenter(factor) {
    var next = Math.min(4, Math.max(0.25, scale * factor));
    var ratio = next / scale;
    var cx = VW / 2, cy = VH / 2;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    scale = next;
    apply();
  }
  bind('gen-in', function () { zoomAtCenter(1.25); });
  bind('gen-out', function () { zoomAtCenter(1 / 1.25); });

  /* Open on Bollobas rather than on me: he is the hub, so this frames my
     row of academic siblings below and the three grandadvisors above. */
  select('bushaw');
  focusOn('bushaw', 1, 0.62);
}());
