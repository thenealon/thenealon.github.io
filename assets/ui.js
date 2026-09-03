/*! ui.js -- theme, tide, and the abstract dialog.  No dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  function get(k) { try { return store && store.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { if (store) { store.setItem(k, v); } } catch (e) {} }

  /* ---- which background -------------------------------------------- */
  var bgBtn = document.getElementById('bg-toggle');
  function labelBg(m) {
    if (!bgBtn) { return; }
    var perc = m === 'perc';
    bgBtn.querySelector('.ctl-ico').textContent = perc ? '\u25A6' : '\u25B3';
    bgBtn.querySelector('.ctl-txt').textContent = perc ? 'Percolation' : 'Graph';
    bgBtn.setAttribute('aria-label', perc
      ? 'Background: bootstrap percolation. Switch to the random geometric graph.'
      : 'Background: random geometric graph. Switch to bootstrap percolation.');
  }
  if (bgBtn) {
    var bg0 = get('nb-bg') === 'perc' ? 'perc' : 'graph';
    root.setAttribute('data-bg', bg0);
    if (window.tidalGraph) { window.tidalGraph.setMode(bg0); }
    labelBg(bg0);
    bgBtn.addEventListener('click', function () {
      if (!window.tidalGraph) { return; }
      var next = window.tidalGraph.getMode() === 'perc' ? 'graph' : 'perc';
      window.tidalGraph.setMode(next);
      set('nb-bg', next);
      labelBg(next);
    });
  }

  /* ---- pace: turtle or rabbit -------------------------------------- */
  var speedBtn = document.getElementById('speed-toggle');
  function labelSpeed(fast) {
    if (!speedBtn) { return; }
    speedBtn.querySelector('.ctl-ico').textContent = fast ? '\uD83D\uDC07' : '\uD83D\uDC22';
    speedBtn.querySelector('.ctl-txt').textContent = fast ? 'Fast' : 'Slow';
    speedBtn.setAttribute('aria-label', fast
      ? 'Background running fast. Slow it down.'
      : 'Background running slowly. Speed it up.');
  }
  if (speedBtn) {
    var fast0 = get('nb-speed') === 'fast';
    if (window.tidalGraph) { window.tidalGraph.setSpeed(fast0); }
    labelSpeed(fast0);
    speedBtn.addEventListener('click', function () {
      if (!window.tidalGraph) { return; }
      var f = !window.tidalGraph.isFast();
      window.tidalGraph.setSpeed(f);
      set('nb-speed', f ? 'fast' : 'slow');
      labelSpeed(f);
    });
  }

  /* ---- pause -------------------------------------------------------
     Note this also reads as paused when the operating system has asked for
     reduced motion; pressing play then overrides that for the session.  */
  var tideBtn = document.getElementById('tide-toggle');
  function labelTide(stopped) {
    if (!tideBtn) { return; }
    tideBtn.querySelector('.ctl-ico').textContent = stopped ? '\u25B6' : '\u258C\u258C';
    tideBtn.querySelector('.ctl-txt').textContent = stopped ? 'Play' : 'Pause';
    tideBtn.setAttribute('aria-pressed', stopped ? 'true' : 'false');
    tideBtn.setAttribute('aria-label',
      stopped ? 'Background is still. Start it.' : 'Pause the background.');
  }
  if (tideBtn && window.tidalGraph) {
    if (get('nb-tide') === 'paused') { window.tidalGraph.setPaused(true); }
    labelTide(window.tidalGraph.isPaused());
    tideBtn.addEventListener('click', function () {
      window.tidalGraph.setPaused(!window.tidalGraph.isPaused());
      var now = window.tidalGraph.isPaused();
      set('nb-tide', now ? 'paused' : 'running');
      labelTide(now);
    });
  }

  /* ---- the running table of contents ------------------------------- */
  (function () {
    var links = document.querySelectorAll('.rail ol a');
    if (!links.length) { return; }
    var map = {}, targets = [];
    for (var i = 0; i < links.length; i++) {
      var id = links[i].getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (!el) { continue; }
      map[id] = links[i];
      targets.push(el);
    }
    if (!targets.length) { return; }

    function mark(id) {
      for (var k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) {
          map[k].classList.toggle('is-here', k === id);
        }
      }
    }

    if (window.IntersectionObserver) {
      /* the section whose top has most recently crossed a line a third of
         the way down the viewport is the one you are reading */
      var seen = {};
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          seen[entries[i].target.id] = entries[i].isIntersecting;
        }
        var current = targets[0].id;
        for (var j = 0; j < targets.length; j++) {
          if (seen[targets[j].id]) { current = targets[j].id; break; }
        }
        mark(current);
      }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });
      for (var t = 0; t < targets.length; t++) { io.observe(targets[t]); }
    } else {
      mark(targets[0].id);
    }
  }());

  /* ---- publication arrangement -----------------------------------
     Chronological is complete without JavaScript.  Once scripting is
     available, reveal the switch and remember the reader's preferred view. */
  (function () {
    var switcher = document.querySelector('[data-publication-switcher]');
    if (!switcher) { return; }
    var buttons = switcher.querySelectorAll('[data-publication-view]');
    var panels = document.querySelectorAll('[data-publication-panel]');
    if (buttons.length !== 2 || panels.length !== 2) { return; }

    function show(view, remember) {
      for (var i = 0; i < buttons.length; i++) {
        var selected = buttons[i].getAttribute('data-publication-view') === view;
        buttons[i].classList.toggle('is-active', selected);
        buttons[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
      for (var j = 0; j < panels.length; j++) {
        panels[j].hidden = panels[j].getAttribute('data-publication-panel') !== view;
      }
      if (remember) { set('nb-publications', view); }
    }

    switcher.hidden = false;
    var initial = get('nb-publications') === 'thematic' ? 'thematic' : 'chronological';
    show(initial, false);
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        show(this.getAttribute('data-publication-view'), true);
      });
    }
  }());

  /* ---- the address ------------------------------------------------
     Assembled here rather than written into the HTML.  Harvesters that do
     not run JavaScript see only the spelled-out form; everyone else gets a
     real mailto link they can tap.  Without JavaScript the spelled-out form
     stays put and is still perfectly readable, including aloud.        */
  (function () {
    var slots = document.querySelectorAll('.email[data-user][data-domain]');
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i];
      var addr = el.getAttribute('data-user') + '@' + el.getAttribute('data-domain');
      var a = document.createElement('a');
      a.href = 'mailto:' + addr;
      a.textContent = addr;
      el.textContent = '';
      el.appendChild(a);
    }
  }());

  /* ---- abstracts ---------------------------------------------------
     Buttons ship hidden.  One is revealed only if fetch_abstracts.py has
     actually retrieved that paper's abstract, so a paper with no abstract
     anywhere simply shows no button.                                    */
  var data = window.ABSTRACTS || {};
  var meta = window.ABSTRACTS_META || {};
  var dlg = document.getElementById('abstract-dialog');
  var buttons = document.querySelectorAll('[data-abstract]');
  var opener = null;

  function entryFor(btn) { return data[btn.getAttribute('data-abstract')]; }

  function paragraphs(text) {
    var parts = String(text).split(/\n\s*\n/);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i].trim()) { continue; }
      var p = document.createElement('p');
      p.textContent = parts[i].trim();
      frag.appendChild(p);
    }
    return frag;
  }

  function close() {
    if (!dlg) { return; }
    if (dlg.close) { dlg.close(); } else { dlg.removeAttribute('open'); }
    if (opener) { opener.focus(); opener = null; }
  }

  function open(btn) {
    var entry = entryFor(btn);
    if (!entry || !dlg) { return; }
    var li = btn.closest ? btn.closest('li') : null;
    var t = li && li.querySelector('.title');
    var v = li && li.querySelector('.venue');

    dlg.querySelector('.dlg-title').textContent = t ? t.textContent : 'Abstract';
    dlg.querySelector('.dlg-meta').textContent = v ? v.textContent : '';
    var body = dlg.querySelector('.dlg-body');
    body.textContent = '';
    body.appendChild(paragraphs(entry.text));
    dlg.querySelector('.dlg-src').textContent =
      (entry.source || '') + (meta.generated ? ' \u00b7 retrieved ' + meta.generated : '');

    opener = btn;
    if (dlg.showModal) { dlg.showModal(); } else { dlg.setAttribute('open', ''); }
  }

  for (var i = 0; i < buttons.length; i++) {
    (function (btn) {
      if (!entryFor(btn)) { return; }   /* no abstract on file: stay hidden */
      btn.hidden = false;
      btn.addEventListener('click', function () { open(btn); });
    }(buttons[i]));
  }

  if (dlg) {
    var closeBtn = dlg.querySelector('[data-close]');
    if (closeBtn) { closeBtn.addEventListener('click', close); }
    /* click on the backdrop */
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { close(); } });
    /* Escape, for the browsers that do not give it to us free */
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !dlg.close) { e.preventDefault(); close(); }
    });
  }
}());
