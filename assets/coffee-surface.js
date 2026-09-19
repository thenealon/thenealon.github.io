/* Coffee on a fixed square lattice. The stain is a visual interpolation;
   the dots show the exact binary infection set supplied by the model.
   Rendering cannot move vertices, change adjacency, or infect a site. */
(function () {
  'use strict';

  var TAU = 2 * Math.PI;
  var cases = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]],
    [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]],
    [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []];

  window.createCoffeeSurface = function () {
    var w = 1, h = 1, cols = 1, rows = 1, cell = 24;
    var paper = document.createElement('canvas');
    var wash = document.createElement('canvas');
    var cached, loops = [];

    function resize(width, height, c, r, px) {
      w = width; h = height; cols = c; rows = r; cell = px;
      cached = new Float32Array(c * r);
      reset();

      /* Lines pass through the vertices; every fifth line is stronger. */
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      paper.width = Math.ceil(w * dpr); paper.height = Math.ceil(h * dpr);
      var p = paper.getContext('2d');
      p.scale(dpr, dpr);
      for (var major = 0; major < 2; major++) {
        p.beginPath();
        for (var x = 0; x < cols; x++) {
          if ((x % 5 === 0) !== !!major) { continue; }
          p.moveTo((x + .5) * cell, 0); p.lineTo((x + .5) * cell, h);
        }
        for (var y = 0; y < rows; y++) {
          if ((y % 5 === 0) !== !!major) { continue; }
          p.moveTo(0, (y + .5) * cell); p.lineTo(w, (y + .5) * cell);
        }
        p.strokeStyle = major ? 'rgba(113,127,134,.19)' : 'rgba(104,119,128,.11)';
        p.lineWidth = major ? .7 : .5;
        p.stroke();
      }
      p.beginPath();
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var vx = (x + .5) * cell, vy = (y + .5) * cell;
        p.moveTo(vx + .8, vy); p.arc(vx, vy, .8, 0, TAU);
      }
      p.fillStyle = 'rgba(132,143,146,.29)'; p.fill();

      /* Stationary pigment, like coffee absorbed by paper. No drifting
         texture that could suggest another evolution of the infection. */
      wash.width = Math.max(1, Math.ceil(w / 4));
      wash.height = Math.max(1, Math.ceil(h / 4));
      var wc = wash.getContext('2d');
      var image = wc.createImageData(wash.width, wash.height);
      for (var y = 0; y < wash.height; y++) for (var x = 0; x < wash.width; x++) {
        var i = (y * wash.width + x) * 4;
        var grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        grain -= Math.floor(grain);
        var pigment = Math.sin(x * .063 + Math.sin(y * .047)) * .48 +
          Math.sin(y * .109 - x * .031) * .28 + (grain - .5) * .22;
        image.data[i] = 76 + pigment * 12;
        image.data[i + 1] = 46 + pigment * 8;
        image.data[i + 2] = 28 + pigment * 5;
        image.data[i + 3] = 255;
      }
      wc.putImageData(image, 0, 0);
    }

    function reset() {
      if (cached) { cached.fill(-1); }
      loops = [];
    }

    function contours(levels) {
      var nodes = Object.create(null), result = [];
      function value(x, y) {
        return x < 0 || y < 0 || x >= cols || y >= rows ? 0 : levels[y * cols + x];
      }
      function edge(x, y, e) {
        var ax = x, ay = y, bx = x, by = y, key;
        if (e === 0) { bx++; key = 'h' + x + ',' + y; }
        if (e === 1) { ax++; bx++; by++; key = 'v' + (x + 1) + ',' + y; }
        if (e === 2) { ay++; by++; bx++; key = 'h' + x + ',' + (y + 1); }
        if (e === 3) { by++; key = 'v' + x + ',' + y; }
        if (!nodes[key]) {
          var a = value(ax, ay), b = value(bx, by);
          var t = (.5 - a) / (b - a);
          nodes[key] = {x: (ax + .5 + (bx - ax) * t) * cell,
            y: (ay + .5 + (by - ay) * t) * cell, next: [], seen: false};
        }
        return key;
      }
      for (var y = -1; y < rows; y++) for (var x = -1; x < cols; x++) {
        var code = (value(x, y) >= .5 ? 1 : 0) | (value(x + 1, y) >= .5 ? 2 : 0) |
          (value(x + 1, y + 1) >= .5 ? 4 : 0) | (value(x, y + 1) >= .5 ? 8 : 0);
        var pairs = cases[code];
        /* Diagonally touching sites stay separate at saddle points. */
        for (var j = 0; j < pairs.length; j++) {
          var a = edge(x, y, pairs[j][0]), b = edge(x, y, pairs[j][1]);
          nodes[a].next.push(b); nodes[b].next.push(a);
        }
      }
      for (var key in nodes) {
        if (nodes[key].seen) { continue; }
        var line = [], at = key, previous = null;
        while (!nodes[at].seen) {
          var node = nodes[at]; node.seen = true; line.push(node);
          var next = node.next[0] === previous ? node.next[1] : node.next[0];
          previous = at; at = next;
          if (!at) { break; }
        }
        if (line.length >= 3) { result.push(line); }
      }
      return result;
    }

    function trace(ctx) {
      ctx.beginPath();
      for (var j = 0; j < loops.length; j++) {
        var p = loops[j], n = p.length;
        ctx.moveTo((p[n - 1].x + p[0].x) / 2, (p[n - 1].y + p[0].y) / 2);
        for (var i = 0; i < n; i++) {
          var a = p[i], b = p[(i + 1) % n];
          ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        ctx.closePath();
      }
    }

    function draw(ctx, levels, infected, opacity) {
      var changed = false;
      for (var i = 0; i < levels.length; i++) {
        if (Math.abs(levels[i] - cached[i]) > .0005) { changed = true; break; }
      }
      if (changed) { loops = contours(levels); cached.set(levels); }

      ctx.save();
      ctx.globalAlpha = opacity;
      if (loops.length) {
        /* A thin pigment edge, without raised highlights or glossy bevels. */
        trace(ctx);
        ctx.strokeStyle = 'rgba(126,83,49,.10)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.save(); ctx.clip('evenodd');
        ctx.globalAlpha = opacity * .68;
        ctx.drawImage(wash, 0, 0, w, h);
        ctx.restore();
        ctx.strokeStyle = 'rgba(160,108,67,.25)'; ctx.lineWidth = .75; ctx.stroke();
      }
      ctx.restore();

      /* Graph paper stays visible above the translucent stain and remains
         in place when one experiment fades into the next. */
      ctx.drawImage(paper, 0, 0, w, h);
      ctx.save(); ctx.globalAlpha = opacity;
      for (var fresh = 0; fresh < 2; fresh++) {
        ctx.beginPath();
        for (var i = 0; i < infected.length; i++) {
          if (!infected[i] || (levels[i] < .96) !== !!fresh) { continue; }
          var x = (i % cols + .5) * cell, y = (Math.floor(i / cols) + .5) * cell;
          ctx.moveTo(x + 1.5, y); ctx.arc(x, y, 1.5, 0, TAU);
        }
        ctx.fillStyle = fresh ? 'rgba(212,170,125,.86)' : 'rgba(169,126,88,.76)';
        ctx.fill();
      }
      ctx.restore();
      if (ctx.canvas && ctx.canvas.setAttribute &&
          ctx.canvas.getAttribute('data-liquid-renderer') !== 'graph-paper') {
        ctx.canvas.setAttribute('data-liquid-renderer', 'graph-paper');
      }
    }

    return {resize: resize, reset: reset, draw: draw};
  };
}());
