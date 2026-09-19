/* Coffee is a rendering of the bootstrap state, not a second simulation.
   The density texture comes only from infected sites. Waves, lighting and
   the sub-cell displacement never change which sites become infected. */
(function () {
  'use strict';
  window.createCoffeeSurface = function () {
    var surface = document.createElement('canvas');
    var gl = null, program = null, texture = null, uniforms = {};
    var w = 1, h = 1, cols = 1, rows = 1, cell = 14, pixels = null;
    var fallback = null, fallbackCtx = null;
    var lost = false;

    function compile(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        var message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    try {
      gl = surface.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: false, powerPreference: 'low-power'
      });
      if (gl && gl.getExtension('OES_standard_derivatives')) {
        var vertex = compile(gl.VERTEX_SHADER,
          'attribute vec2 aPosition; varying vec2 vUV;' +
          'void main(){vUV=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5);' +
          'gl_Position=vec4(aPosition,0.,1.);}');
        var fragment = compile(gl.FRAGMENT_SHADER, [
          '#extension GL_OES_standard_derivatives : enable',
          'precision highp float;',
          'varying vec2 vUV;',
          'uniform sampler2D uState;',
          'uniform vec2 uSize, uGrid;',
          'uniform float uCell, uTime, uOpacity;',
          'float noise(vec2 p) {',
          '  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);',
          '  vec3 s=vec3(127.1,311.7,74.7);',
          '  float a=fract(sin(dot(i,s.xy))*4375.85);',
          '  float b=fract(sin(dot(i+vec2(1,0),s.xy))*4375.85);',
          '  float c=fract(sin(dot(i+vec2(0,1),s.xy))*4375.85);',
          '  float d=fract(sin(dot(i+vec2(1,1),s.xy))*4375.85);',
          '  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);',
          '}',
          // Cubic B-spline reconstruction: continuous slopes, four filtered
          // texture reads. This avoids both square tiles and faceted glints.
          'float density(vec2 q) {',
          '  vec2 p=q-.5, i=floor(p), f=fract(p);',
          '  vec2 w0=pow(1.-f,vec2(3.))/6.;',
          '  vec2 w1=(3.*f*f*f-6.*f*f+4.)/6.;',
          '  vec2 w2=(-3.*f*f*f+3.*f*f+3.*f+1.)/6.;',
          '  vec2 w3=f*f*f/6.;',
          '  vec2 g0=w0+w1, g1=w2+w3;',
          '  vec2 h0=(i-.5+w1/g0)/uGrid;',
          '  vec2 h1=(i+1.5+w3/g1)/uGrid;',
          '  float a=texture2D(uState,h0).r;',
          '  float b=texture2D(uState,vec2(h1.x,h0.y)).r;',
          '  float c=texture2D(uState,vec2(h0.x,h1.y)).r;',
          '  float d=texture2D(uState,h1).r;',
          '  return mix(mix(a,b,g1.x),mix(c,d,g1.x),g1.y);',
          '}',
          'void main() {',
          '  vec2 p=vUV*uSize;',
          '  float t=uTime;',
          '  vec2 bend=vec2(sin(p.y*.020+t*.45)+.38*sin(p.x*.048-p.y*.031-t*.5),',
          '                 cos(p.x*.019-t*.4)+.35*sin(p.y*.044+p.x*.027+t*.5));',
          '  float f=density((p+bend*11.)/uCell);',
          '  float aa=max(.005,fwidth(f)*.85);',
          '  float mask=smoothstep(.235-aa,.235+aa,f);',
          '  float d1=length(p-uSize*vec2(.18,.34));',
          '  float d2=length(p-uSize*vec2(.77,.73));',
          '  float ripple=.55*sin(d1*.072-t*2.5)+.35*sin(d2*.089-t*2.1);',
          '  ripple+=.28*sin(p.x*.022+p.y*.013-t*.85);',
          '  float meniscus=exp(-abs(f-.27)*26.);',
          '  vec2 slope=vec2(dFdx(f),dFdy(f))*13.;',
          '  slope+=vec2(dFdx(ripple),dFdy(ripple))*1.8;',
          '  vec3 normal=normalize(vec3(-slope,1.));',
          '  vec3 light=normalize(vec3(-.18,.27,1.));',
          '  float shine=pow(max(0.,dot(normal,light)),65.);',
          '  float body=noise(p*.009+vec2(t*.013,-t*.007));',
          '  vec3 brown=mix(vec3(.17,.070,.031),vec3(.32,.16,.078),body);',
          '  brown*=.93+.07*ripple;',
          '  brown+=meniscus*vec3(.20,.12,.067);',
          '  brown+=shine*vec3(.29,.235,.17)*(.45+.55*meniscus);',
          '  brown*=smoothstep(.23,.36,f)*.40+.60;',
          '  gl_FragColor=vec4(brown*mask*uOpacity,1.);',
          '}'
        ].join('\n'));
        program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program));
        }
        gl.useProgram(program);
        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        var position = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        ['uState','uSize','uGrid','uCell','uTime','uOpacity'].forEach(function (name) {
          uniforms[name] = gl.getUniformLocation(program, name);
        });
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.uniform1i(uniforms.uState, 0);
      } else {
        gl = null;
      }
    } catch (e) {
      console.warn('Coffee surface: using the Canvas fallback.', e.message);
      gl = null;
    }

    surface.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      lost = true;
    });

    function resize(width, height, c, r, px) {
      w = width; h = height; cols = c; rows = r; cell = px;
      pixels = new Uint8Array(cols * rows);
      // Limit GPU work independently of screen density.
      var scale = Math.min(window.devicePixelRatio || 1, 1.25,
        Math.sqrt(1000000 / Math.max(1, w * h)));
      surface.width = Math.max(1, Math.round(w * scale));
      surface.height = Math.max(1, Math.round(h * scale));
      if (gl && !lost) {
        gl.viewport(0, 0, surface.width, surface.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cols, rows, 0,
          gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
        gl.uniform2f(uniforms.uSize, w, h);
        gl.uniform2f(uniforms.uGrid, cols, rows);
        gl.uniform1f(uniforms.uCell, cell);
      }
      if (fallback) { fallback.width = Math.ceil(w); fallback.height = Math.ceil(h); }
    }

    function drawFallback(ctx, levels, time, opacity) {
      if (!fallback) {
        fallback = document.createElement('canvas');
        fallback.width = Math.ceil(w); fallback.height = Math.ceil(h);
        fallbackCtx = fallback.getContext('2d');
      }
      var fc = fallbackCtx;
      fc.clearRect(0, 0, w, h);
      var gradient = fc.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#653e25');
      gradient.addColorStop(0.5, '#3c1c0d');
      gradient.addColorStop(1, '#57321c');
      fc.fillStyle = gradient;
      fc.beginPath();
      for (var i = 0; i < levels.length; i++) {
        if (levels[i] < .02) { continue; }
        var x = ((i % cols) + .5) * cell;
        var y = (((i / cols) | 0) + .5) * cell;
        var radius = cell * .8 * levels[i];
        x += Math.sin(y * .031 + time * .65) * 2;
        y += Math.cos(x * .025 - time * .55) * 2;
        fc.moveTo(x + radius, y);
        fc.arc(x, y, radius, 0, Math.PI * 2);
      }
      fc.fill();
      // Shallow rings are clipped to the actual pooled surface.
      fc.globalCompositeOperation = 'source-atop';
      fc.strokeStyle = 'rgba(191,155,124,.10)';
      fc.lineWidth = 1.4;
      for (var ring = 0; ring < 14; ring++) {
        fc.beginPath();
        fc.ellipse(w * .2, h * .35, (ring * 35 + time * 10) % 500 + 2,
          (ring * 25 + time * 7) % 357 + 2, -.3, 0, Math.PI * 2);
        fc.stroke();
      }
      fc.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.filter = 'blur(2px)';
      ctx.drawImage(fallback, 0, 0, w, h);
      ctx.restore();
    }

    function draw(ctx, levels, time, opacity) {
      if (!gl || lost) { drawFallback(ctx, levels, time, opacity); return; }
      for (var i = 0; i < levels.length; i++) { pixels[i] = Math.round(levels[i] * 255); }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows,
        gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uOpacity, opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.drawImage(surface, 0, 0, w, h);
    }

    function mug(ctx, x, y, tilt) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 3;
      // Ceramic handle, then the little tapered cup.
      ctx.strokeStyle = '#bcb1a1';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(-15, 2, 7, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      var glaze = ctx.createLinearGradient(-12, 0, 13, 0);
      glaze.addColorStop(0, '#aca396');
      glaze.addColorStop(.42, '#f0e9dc');
      glaze.addColorStop(1, '#ccc0ad');
      ctx.fillStyle = glaze;
      ctx.beginPath();
      ctx.moveTo(-13, -9);
      ctx.lineTo(-10, 11);
      ctx.bezierCurveTo(-9, 17, 9, 17, 10, 11);
      ctx.lineTo(13, -9);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#e6dccc';
      ctx.beginPath(); ctx.ellipse(0, -9, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#352013';
      ctx.beginPath(); ctx.ellipse(0, -9, 10.5, 3.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(203,168,126,.6)'; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.ellipse(0, -9, 9, 2.7, 0, Math.PI, Math.PI * 1.9); ctx.stroke();
      ctx.restore();
    }

    function poolPosition(x, y, time) {
      if (!gl || lost) {
        var fx = x + Math.sin(y * .031 + time * .65) * 2;
        return { x: fx, y: y + Math.cos(fx * .025 - time * .55) * 2 };
      }
      // Invert the display-only displacement so drops land in their pools.
      var px = x, py = y;
      for (var pass = 0; pass < 5; pass++) {
        var bx = Math.sin(py * .020 + time * .45) +
          .38 * Math.sin(px * .048 - py * .031 - time * .5);
        var by = Math.cos(px * .019 - time * .4) +
          .35 * Math.sin(py * .044 + px * .027 + time * .5);
        px = x - bx * 11;
        py = y - by * 11;
      }
      return { x: px, y: py };
    }

    function drop(ctx, seed, u, time) {
      var target = poolPosition(seed.x, seed.y, time);
      ctx.save();
      if (u < 1) {
        var x = seed.startX + (target.x - seed.startX) * u;
        var y = seed.startY + (target.y - seed.startY) * u * u;
        var prev = Math.max(0, u - .13);
        ctx.strokeStyle = 'rgba(117,70,37,.8)';
        ctx.lineWidth = 1.7; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(seed.startX + (target.x - seed.startX) * prev,
          seed.startY + (target.y - seed.startY) * prev * prev);
        ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#8a5330';
        ctx.beginPath(); ctx.ellipse(x, y, 1.8, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        var age = (u - 1) / .65;
        ctx.strokeStyle = 'rgba(169,119,79,' + ((1 - age) * .35) + ')';
        ctx.lineWidth = .8;
        ctx.beginPath();
        ctx.ellipse(target.x, target.y, 2 + age * 9, 1.5 + age * 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    return { resize: resize, draw: draw, mug: mug, drop: drop };
  };
}());
