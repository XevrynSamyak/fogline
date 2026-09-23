(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const ease = x => x * x * (3 - 2 * x);
  const fract = x => x - Math.floor(x);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const metres = n => n.toLocaleString('en-IN') + ' m';
  const tokens = getComputedStyle(document.documentElement);
  const C = {};
  for (const k of ['fog', 'paper', 'deodar', 'slate', 'contour', 'lamp', 'decoction']) C[k] = tokens.getPropertyValue('--' + k).trim();
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

  // Wheel scrolling gets weight and glide; touch keeps the phone's own momentum.
  const lenis = !reduced && window.Lenis ? new window.Lenis({ lerp: .085, wheelMultiplier: .9, anchors: true, allowNestedScroll: true }) : null;
  $('.skip').addEventListener('click', () => $('#room').focus({ preventScroll: true }));

  // Opening hours run on hill time (IST), whatever the visitor's clock says.
  function paintStatus() {
    const now = new Date();
    const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 6e4);
    const mins = ist.getHours() * 60 + ist.getMinutes();
    const open = mins >= 420 && mins < 1140;
    const clock = `${ist.getHours() % 12 || 12}:${String(ist.getMinutes()).padStart(2, '0')} ${ist.getHours() < 12 ? 'am' : 'pm'}`;
    const later = mins >= 1140 ? ' tomorrow' : '';
    for (const el of $$('[data-status]')) el.classList.toggle('is-open', open);
    for (const el of $$('[data-status-short]')) el.textContent = open ? 'Open until 7 pm' : `Opens 7 am${later}`;
    for (const el of $$('[data-status-long]')) {
      el.textContent = open ? `Open now, until 7 pm. It's ${clock} on the hill.` : `Closed. It's ${clock} on the hill, and we open at 7 am${later}.`;
    }
  }

  // The ridge profile, kept in step with ridge() in the shader so the page
  // can choose where the lit cabin stands.
  const hash11 = p => { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); };
  const noise1 = x => { const i = Math.floor(x), f = x - i; return hash11(i) + (hash11(i + 1) - hash11(i)) * f * f * (3 - 2 * f); };
  const fbm1 = x => { let s = 0, a = .5; for (let i = 0; i < 5; i++) { s += a * noise1(x); x = x * 2.1 + 3.7; a *= .5; } return s; };
  const depth = i => .1 + .9 * Math.pow(i / 5, 1.35);
  const ridge = (x, i) => { const k = i / 5; return .1 - .4 * k + (fbm1(x * (1.1 + 1.2 * k) + i * 17.13) - .48) * (.34 - .18 * k); };

  function cabinSpot(aspect) {
    const span = Math.min(aspect, 1.8), lift = .6 * .55;
    let best = .2 * span, score = -Infinity;
    for (let f = .06; f <= .42; f += .02) {
      const x = f * span;
      const clear = ridge(x, 3) - lift * depth(3) - Math.max(ridge(x, 4) - lift * depth(4) + .07, ridge(x, 5) - lift * depth(5) + .12);
      if (clear > score) { score = clear; best = x; }
    }
    return best;
  }

  const FOG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uT;
uniform float uIntro;
uniform vec2 uCabin;
uniform vec3 uCup;
uniform sampler2D uTitle;
uniform sampler2D uWipe;
uniform float uGlass;

const vec3 LAMP = vec3(1., .66, .3);
const vec2 DOOR_AT = vec2(.011, 0.);

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise1(float x) { float i = floor(x); float f = fract(x); return mix(hash11(i), hash11(i + 1.), f * f * (3. - 2. * f)); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
}
float fbm1(float x) { float s = 0.; float a = .5; for (int i = 0; i < 5; i++) { s += a * noise1(x); x = x * 2.1 + 3.7; a *= .5; } return s; }
float fbm(vec2 p) { float s = 0.; float a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 4.7; a *= .5; } return s; }

float depth(float i) { return .1 + .9 * pow(i / 5., 1.35); }
float ridge(float x, float i) { float k = i / 5.; return .1 - .4 * k + (fbm1(x * (1.1 + 1.2 * k) + i * 17.13) - .48) * (.34 - .18 * k); }
float ground(float x, float i) {
  float g = ridge(x, i);
  if (i == 3.) g = mix(g, uCabin.y, 1. - smoothstep(.04, .09, abs(x - uCabin.x)));
  return g;
}

// Deodars: tiered cones, one per cell, some cells left empty.
float trees(vec2 q, float i, float g0, float px) {
  float w = mix(.0065, .075, (i / 5.) * (i / 5.));
  if (q.y < g0 - .04 || q.y > g0 + w * 4.2 + .06) return 0.;
  float cell = floor(q.x / w);
  float m = 0.;
  for (int j = -1; j <= 1; j++) {
    float c = cell + float(j);
    float keep = step(.14, hash11(c * 1.37 + i * 91.7));
    float xc = (c + .15 + .7 * hash11(c * 7.31 + i * 3.1)) * w;
    if (i == 3.) keep *= step(.07, abs(xc - uCabin.x));
    float g = ground(xc, i);
    float h = w * (2.1 + 2. * hash11(c * 3.71 + i * 5.3));
    float t = (q.y - g) / h;
    if (t > 1. || t < -.3) continue;
    float tt = clamp(t, 0., 1.);
    float tiers = 4. + floor(hash11(c * 9.1 + i) * 4.);
    float hw = w * (.52 * (1. - tt) * (.5 + .5 * (1. - fract(tt * tiers))) + .03 * (1. - tt));
    m = max(m, keep * (1. - smoothstep(-px, px, abs(q.x - xc) - hw)));
  }
  return m;
}

// Before it condenses the steam is everywhere: it is the fog. Then it gathers over the cup.
float steam(vec2 p, float t, float cond) {
  float h = p.y - uCup.y;
  float hp = max(h, 0.);
  float sway = (fbm(vec2(hp * 1.6 - t * .18, 2.3)) - .5) * .6 * hp;
  float x = p.x - uCup.x - sway;
  float spread = uCup.z * .75 + hp * .3;
  float plume = exp(-x * x / (spread * spread)) * smoothstep(-.005, .05, h) * exp(-hp * 1.5);
  float n = fbm(vec2(x * 6. / (1. + hp * 2.), hp * 3.4 - t * .8));
  float s = plume * smoothstep(.3, .75, n) * 1.35;
  float everywhere = .5 + .5 * fbm(p * 1.8 + vec2(t * .02, -t * .01));
  return mix(everywhere, s, cond);
}

// The room, in screen space: lamp light, the warm air over the cup, and the steam.
vec3 room(vec2 p, float t, float cond, float aspect) {
  vec3 bg = vec3(.105, .07, .05);
  bg += vec3(.42, .24, .1) * exp(-length((p - vec2(-.45 * min(aspect, 1.6), .32)) * vec2(.8, 1.)) * 2.4) * .45;
  bg += vec3(.3, .18, .08) * exp(-length(p - uCup.xy - vec2(0., .1)) * 3.) * .25;
  float s = clamp(steam(p, t, cond), 0., 1.);
  vec3 sc = mix(vec3(.93, .91, .87), vec3(.98, .84, .66), .35 * smoothstep(-.6, .2, uCup.x - p.x));
  return mix(bg, sc, s);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float aspect = uRes.x / uRes.y;
  float T = uT;
  float time = uTime;

  float dawn = .12 + .88 * smoothstep(.2, 1.9, T);
  float climb = .3 * smoothstep(0., 1., T) + .7 * smoothstep(1., 2., T);
  float push = smoothstep(1.05, 2.05, T);
  float wipe = smoothstep(.12, .6, texture2D(uWipe, uv).r);
  float lampOn = .35 + .65 * smoothstep(.9, 1.5, T);
  // The door swings in, the camera turns to face it, then walks through into the light.
  float open = smoothstep(1.5, 1.8, T);
  float enter = smoothstep(1.6, 2., T);
  float dive = smoothstep(1.72, 2.12, T);
  dive *= dive;
  float inside = smoothstep(2.1, 2.26, T);
  float cond = smoothstep(2.18, 2.72, T);
  vec3 col = vec3(0.);

  if (inside < 1.) {
    vec2 focus = uCabin + mix(vec2(0., .025), DOOR_AT + vec2(0., .009), enter) - vec2(0., climb * .55 * depth(3.));
    vec2 aim = mix(vec2(focus.x * .5, -.02), vec2(0.), enter);
    vec2 pp = p - push * (aim - focus);

    vec2 sun = vec2(-.3 * min(aspect, 1.6), -.06 + .32 * dawn);
    float sunD = length((pp - sun) * vec2(.55, 1.));
    vec3 fogCol = mix(vec3(.8, .84, .83), vec3(.94, .87, .79), clamp(dawn * (.25 + exp(-sunD * 1.8)), 0., 1.));

    float hy = clamp(pp.y + .5, 0., 1.);
    col = mix(mix(vec3(.8, .84, .84), vec3(.95, .88, .8), dawn), mix(vec3(.6, .66, .7), vec3(.74, .76, .77), dawn), smoothstep(.45, 1., hy));
    col += vec3(1., .8, .56) * (exp(-sunD * 7.) * .45 + exp(-sunD * 2.) * .12) * dawn;

    float px0 = 1.25 / uRes.y;
    float halo = 0., glow = 0., spill = 0., doorLit = 0., occ = 0.;
    for (int n = 0; n < 6; n++) {
      float i = float(n);
      float k = depth(i);

      if (n == 4) {
        float kt = depth(3.5);
        vec2 qt = focus + (pp - focus) / ((1. + push * 5. * kt) * (1. + dive * 70. * kt)) + vec2(0., climb * .55 * kt);
        float ta = texture2D(uTitle, vec2(qt.x / aspect + .5, qt.y + .5)).a;
        col = mix(col, vec3(.16, .22, .21), ta * .9 * uIntro * (1. - smoothstep(.7, 1.1, T)));
      }

      float s = (1. + push * 5. * k) * (1. + dive * 70. * k);
      vec2 q = focus + (pp - focus) / s + vec2(0., climb * .55 * k);
      float px = px0 / s;
      float g = ground(q.x, i);
      float m = max(1. - smoothstep(-px, px, q.y - g), trees(q, i, g, px));
      vec3 lc = mix(vec3(.47, .54, .56), vec3(.085, .13, .12), pow(i / 5., .75));
      col = mix(col, lc, m);
      if (n > 3) occ = max(occ, m);

      if (n == 3) {
        vec2 c = q - uCabin;
        float body = (1. - smoothstep(.024 - px, .024 + px, abs(c.x))) * (1. - smoothstep(.028 - px, .028 + px, c.y)) * step(-.002, c.y);
        float roofH = .052 - abs(c.x) * .9;
        float roof = (1. - smoothstep(.033 - px, .033 + px, abs(c.x))) * (1. - smoothstep(roofH - px, roofH + px, c.y)) * step(.026, c.y);
        col = mix(col, lc * .62, max(body, roof));
        vec2 wc = c - vec2(-.009, .013);
        float win = (1. - smoothstep(.0055 - px, .0055 + px, abs(wc.x))) * (1. - smoothstep(.0048 - px, .0048 + px, abs(wc.y)));
        col = mix(col, LAMP * 1.15, win * lampOn);
        float gd = length(wc * vec2(1., 1.2));
        col += LAMP * (exp(-gd * 60.) * .8 + exp(-gd * 14.) * .2) * lampOn;
        halo = exp(-gd * 5.) * lampOn;

        // The door is hinged on its right edge and swings inward. Closed, a line of
        // lamplight leaks under it; open, the gap it leaves is the lit room.
        vec2 dc = c - DOOR_AT;
        float frame = (1. - smoothstep(.0048 - px, .0048 + px, abs(dc.x))) * smoothstep(-px, px, dc.y) * (1. - smoothstep(.018 - px, .018 + px, dc.y));
        float edge = .0048 - .0096 * cos(open * 1.4);
        float leaf = frame * smoothstep(edge - px, edge + px, dc.x);
        col = mix(col, lc * .42, leaf);
        col += LAMP * frame * (1. - smoothstep(0., .0014, dc.y)) * lampOn * .9;
        doorLit = frame - leaf;
        float below = max(-dc.y, 0.);
        spill = open * step(dc.y, 0.) * (1. - smoothstep(.6, 1., abs(dc.x) / (.0048 + below * 1.3))) * exp(-below * 80.);
        glow = open * exp(-length((dc - vec2(0., .009)) * vec2(1., .7)) * 16.);
      }

      float f = fbm(vec2(q.x * .55 + time * (.01 + .006 * i), q.y * 1.8 - time * .004) * (1.7 + i * .25) + i * 3.7);
      float a = smoothstep(.34, .78, f) * (1. - smoothstep(-.08, .26, q.y - g)) * mix(.5, .85, k);
      float part = 1. - wipe * step(1.5, i) * .92;
      part *= 1. - enter * step(2.5, i) * .85;
      float haze = mix(.24, .05, k) * (1. - wipe * .5) * (1. - enter * step(2.5, i) * .85);
      a *= part;
      col = mix(col, fogCol, clamp(a + haze * (1. - a), 0., 1.));
    }
    // Door light sits on top of the fog, unless a nearer ridge stands in front of it.
    // Through the gap you see the room itself; walking through, the gap becomes the screen.
    float vis = 1. - occ;
    col += LAMP * ((halo * .16 + glow * .35) * (1. - enter) + spill * .6) * vis;
    float valley = 1. - smoothstep(-.5, -.14, p.y);
    col = mix(col, fogCol, valley * .82 * (1. - wipe * .85) * (1. - enter));
    float veil = .2 * (1. - smoothstep(0., 1., T)) + .14 * smoothstep(1.3, 1.6, T) * (1. - enter);
    col = mix(col, fogCol, veil * (1. - wipe));
    // Seen from outside the doorway is lamplight; stepping through, it settles into the room.
    float through = smoothstep(1.98, 2.14, T);
    float portal = max(doorLit * vis, through);
    if (portal > 0.) col = mix(col, mix(room(p, time, cond, aspect), vec3(1., .84, .6), .75 * (1. - through)), portal);
  }

  if (inside > 0.) col = mix(col, room(p, time, cond, aspect), inside);

  // Condensation on the café window, cleared where the cursor wipes, plus the lamp reflected in the glass.
  if (uGlass > 0.) {
    float frost = (.5 + .25 * fbm(uv * vec2(7., 9.) + 3.1)) * (1. - wipe);
    col = mix(col, vec3(.84, .83, .8), frost);
    col += vec3(.5, .3, .12) * exp(-length((uv - vec2(.12, .9)) * vec2(1.4, 1.)) * 3.) * .22;
  }

  col += (hash12(gl_FragCoord.xy + fract(time) * 97.) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;

  const stage = $('.drive__stage');

  // `glass` draws the view from the café window instead: no title, no cabin, and condensation
  // on the pane that the cursor wipes and that slowly fogs back up.
  function makeFog(canvas, { glass = false } = {}) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
      console.warn(gl.getShaderInfoLog(sh));
      return null;
    };
    const vs = compile(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }');
    const fs = compile(gl.FRAGMENT_SHADER, FOG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    for (const name of ['uRes', 'uTime', 'uT', 'uIntro', 'uCabin', 'uCup', 'uTitle', 'uWipe', 'uGlass']) u[name] = gl.getUniformLocation(prog, name);
    gl.uniform3f(u.uCup, .3, -.3, .03);
    gl.uniform1f(u.uGlass, glass ? 1 : 0);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const texture = unit => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const titleTex = texture(0), wipeTex = texture(1);
    gl.uniform1i(u.uTitle, 0);
    gl.uniform1i(u.uWipe, 1);
    const upload = (unit, tex, src) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    };

    const title = document.createElement('canvas');
    const wipe = document.createElement('canvas');
    const wctx = wipe.getContext('2d');
    const born = performance.now();
    let quality = 1, W = 0, H = 0, pointer = null, prev = null, fontsIn = false, introAt = null, lost = false, healed = 0;

    function drawTitle() {
      const w = canvas.width, h = canvas.height;
      title.width = glass ? 1 : w;
      title.height = glass ? 1 : h;
      if (glass) return upload(0, titleTex, title);
      const c = title.getContext('2d');
      const size = Math.min(w * (w > h ? .2 : .235), h * .34);
      c.font = `600 ${size}px Eczar, Georgia, serif`;
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      if ('letterSpacing' in c) c.letterSpacing = `${(-size * .015).toFixed(1)}px`;
      c.fillText('Fogline', w / 2, h * (w > h ? .56 : .44));
      upload(0, titleTex, title);
    }

    function resize(force) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h || (!force && w === W && h === H)) return;
      W = w;
      H = h;
      const scale = Math.min(devicePixelRatio || 1, 1.5) * quality;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      wipe.width = w >= h ? 256 : Math.round(256 * w / h);
      wipe.height = w >= h ? Math.round(256 * h / w) : 256;
      wctx.fillStyle = '#000';
      wctx.fillRect(0, 0, wipe.width, wipe.height);
      drawTitle();
      if (glass) gl.uniform2f(u.uCabin, 99, -1);
      else { const x = cabinSpot(w / h); gl.uniform2f(u.uCabin, x, ridge(x, 3)); }
    }

    (glass ? canvas : window).addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || !W) return;
      const box = canvas.getBoundingClientRect();
      pointer = [(e.clientX - box.left) / box.width * wipe.width, (e.clientY - box.top) / box.height * wipe.height];
    }, { passive: true });
    (glass ? canvas : document.documentElement).addEventListener('pointerleave', () => { prev = null; });

    // The cursor clears a trail through the fog that closes up again over about three seconds.
    // Healing steps at a fixed 10 Hz so it looks the same on 60 and 120 Hz screens.
    function paintWipe(now) {
      if (now - healed > 100) {
        healed = now;
        wctx.fillStyle = glass ? 'rgba(0,0,0,.02)' : 'rgba(0,0,0,.035)';
        wctx.fillRect(0, 0, wipe.width, wipe.height);
      }
      if (pointer) {
        const r = wipe.height * .12, from = prev || pointer;
        const steps = Math.max(1, Math.ceil(Math.hypot(pointer[0] - from[0], pointer[1] - from[1]) / (r * .3)));
        for (let i = 1; i <= steps; i++) {
          const x = from[0] + (pointer[0] - from[0]) * i / steps, y = from[1] + (pointer[1] - from[1]) * i / steps;
          const g = wctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(255,255,255,.3)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          wctx.fillStyle = g;
          wctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        prev = pointer;
        pointer = null;
      }
      upload(1, wipeTex, wipe);
    }

    function render(now, t, cupBox, top) {
      if (lost) return;
      paintWipe(now);
      if (fontsIn && introAt === null) introAt = now;
      const intro = reduced ? 1 : introAt === null ? 0 : clamp((now - introAt) / 2600, 0, 1);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, reduced ? 40 : (now - born) / 1000);
      gl.uniform1f(u.uT, t);
      gl.uniform1f(u.uIntro, intro * intro * (3 - 2 * intro));
      if (cupBox) {
        // Steam leaves the coffee's surface: its centre and half-width in the cup's 240×200 drawing.
        const x = cupBox.left + cupBox.width * (112 / 240), y = cupBox.top - top + cupBox.height * (64 / 200);
        gl.uniform3f(u.uCup, (x - W / 2) / H, (H / 2 - y) / H, cupBox.width * (55 / 240) / H);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      lost = true;
      canvas.hidden = true;
      if (!glass) document.documentElement.classList.remove('gl');
    });

    const fontsReady = () => { if (!fontsIn) { fontsIn = true; drawTitle(); } };
    (document.fonts ? document.fonts.load('600 80px Eczar') : Promise.resolve()).then(fontsReady, fontsReady);
    setTimeout(fontsReady, 3000);

    resize(true);
    return {
      resize,
      render,
      degrade() { if (quality > .45) { quality -= .15; resize(true); } },
    };
  }

  // Catmull-Rom through a list of points, sampled into a polyline.
  function spline(pts, steps) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(k => .5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function fit(canvas) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function rng(seed) {
    return () => {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function valueNoise(seed) {
    const r = rng(seed), perm = new Uint8Array(512), vals = new Float32Array(256), p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) vals[i] = r();
    const at = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
    };
  }

  const fbm2 = (n, x, y) => { let s = 0, a = .5; for (let i = 0; i < 4; i++) { s += a * n(x, y); x = x * 2.03 + 5.1; y = y * 2.03 + 1.7; a *= .5; } return s; };

  // Marching squares: adds every segment of one contour level to the current path.
  function trace(ctx, f, cols, rows, cell, level) {
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i], b = f[j * cols + i + 1], c = f[(j + 1) * cols + i + 1], d = f[(j + 1) * cols + i];
        const k = (a > level) << 3 | (b > level) << 2 | (c > level) << 1 | (d > level);
        if (k === 0 || k === 15) continue;
        const x = i * cell, y = j * cell;
        const top = () => [x + (level - a) / (b - a) * cell, y];
        const right = () => [x + cell, y + (level - b) / (c - b) * cell];
        const bottom = () => [x + (level - d) / (c - d) * cell, y + cell];
        const left = () => [x, y + (level - a) / (d - a) * cell];
        const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
        switch (k) {
          case 1: case 14: seg(left(), bottom()); break;
          case 2: case 13: seg(bottom(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 5: seg(left(), top()); seg(bottom(), right()); break;
          case 6: case 9: seg(top(), bottom()); break;
          case 7: case 8: seg(left(), top()); break;
          case 10: seg(top(), right()); seg(left(), bottom()); break;
        }
      }
    }
  }

  function mapLabel(ctx, text, x, y, { align = 'left', weight = 500, size = 13, halo = C.paper } = {}) {
    ctx.font = `${weight} ${size}px "Anek Latin", "Avenir Next", sans-serif`;
    ctx.textAlign = align;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = halo;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = C.deodar;
    ctx.fillText(text, x, y);
  }

  // The room plan
  const note = $('.plan__note');
  const planItems = $$('.plan .item');
  function pick(item) {
    for (const i of planItems) i.classList.toggle('is-active', i === item);
    const name = document.createElement('strong');
    name.textContent = item.getAttribute('aria-label') + '.';
    note.replaceChildren(name, ' ' + item.dataset.note);
  }
  for (const item of planItems) for (const type of ['pointerenter', 'focus', 'click']) item.addEventListener(type, () => pick(item));

  // Last Monday's roast, bean probe in °C against seconds from charge.
  const ROAST = [[0, 200], [15, 170], [30, 143], [45, 121], [60, 105], [72, 96], [84, 92], [100, 93], [120, 99], [150, 109], [180, 119], [210, 128], [240, 137], [280, 151], [330, 162], [390, 174], [450, 185], [516, 196], [540, 199], [570, 202.5], [600, 205.8], [612, 207]];
  const curveSvg = $('.curve__svg');

  function drawCurve() {
    const W = Math.round(curveSvg.parentElement.clientWidth);
    if (!W) return;
    const H = Math.round(clamp(W * .62, 300, 440)) + 56;
    const L = 44, R = W - 12, T = 40, B = H - 74;
    const x = s => L + s / 660 * (R - L);
    const y = c => B - (c - 70) / 150 * (B - T);
    const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const f = n => n.toFixed(1);
    let g = `<text class="title" x="${L}" y="16">Bean temperature, °C</text>`;
    for (const c of [100, 150, 200]) {
      g += `<line class="grid" x1="${L}" x2="${R}" y1="${f(y(c))}" y2="${f(y(c))}"/><text x="${L - 8}" y="${f(y(c) + 4)}" text-anchor="end">${c}</text>`;
    }
    [[0, 280, 'Drying'], [280, 516, 'Browning'], [516, 612, 'Development']].forEach(([a, b, name], i) => {
      const last = i === 2, tx = f(last ? x(b) : x(a) + 2), anchor = last ? 'end' : 'start';
      g += `<rect class="band" x="${f(x(a))}" y="${T}" width="${f(x(b) - x(a))}" height="${B - T}" opacity="${(.03 + i * .035).toFixed(3)}"/>`;
      g += `<path class="span" d="M${f(x(a) + 1)} ${B + 30}H${f(x(b) - 1)}M${f(x(a) + 1)} ${B + 26}v8M${f(x(b) - 1)} ${B + 26}v8"/>`;
      g += `<text x="${tx}" y="${B + 48}" text-anchor="${anchor}">${name}</text><text x="${tx}" y="${B + 63}" text-anchor="${anchor}">${clock(b - a)}</text>`;
    });
    for (let m = 0; m <= 10; m += 2) g += `<text x="${f(x(m * 60))}" y="${B + 18}" text-anchor="middle">${m === 10 ? '10 min' : m}</text>`;
    g += `<line class="axis" x1="${L}" x2="${R}" y1="${B}" y2="${B}"/>`;
    const line = spline(ROAST.map(([s, c]) => [x(s), y(c)]), 8);
    g += `<path class="line" pathLength="1" d="M${line.map(p => f(p[0]) + ' ' + f(p[1])).join('L')}"/>`;
    // Each marker appears when the drawn line reaches it; spline() puts ROAST[k] at line[k * 8].
    const run = [0];
    for (let i = 1; i < line.length; i++) run.push(run[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    const events = [[0, 'Charge, 200°', 8, -10, 'start'], [6, 'Turning point, 1:24', 10, 22, 'start'], [17, 'First crack, 8:36', -10, -12, 'end'], [21, 'Drop, 10:12', 0, -14, 'end']];
    for (const [k, label, dx, dy, anchor] of events) {
      const [s, c] = ROAST[k], at = (run[k * 8] / run[run.length - 1] * .97).toFixed(3);
      g += `<g class="ev" style="--at:${at}"><circle class="dot" cx="${f(x(s))}" cy="${f(y(c))}" r="4.5"/><text class="event" x="${f(x(s) + dx)}" y="${f(y(c) + dy)}" text-anchor="${anchor}">${label}</text></g>`;
    }
    curveSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    curveSvg.setAttribute('width', W);
    curveSvg.setAttribute('height', H);
    curveSvg.querySelector('.curve__plot')?.remove();
    curveSvg.insertAdjacentHTML('beforeend', `<g class="curve__plot">${g}</g>`);
  }

  // The board: each origin gets a contour plate drawn from its own seed.
  const plate = $('.plate__map');
  const hillButtons = $$('.hill');
  const plateFields = $$('.plate [data-f]');
  let current = hillButtons.find(b => b.getAttribute('aria-pressed') === 'true') || hillButtons[0];
  let art = null, artShown = -1, artSince = 0;

  function buildPlate(d) {
    const { ctx, w, h } = fit(plate);
    if (!w) return;
    const cell = 5, cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1, aspect = w / h;
    const low = +d.low, peak = +d.peak, grown = +d.grown, coast = grown === 0;
    const n = valueNoise(+d.seed), r = rng(+d.seed * 31 + 7);
    const hills = [{ x: .4 + r() * .2, y: .36 + r() * .2, s: .3, h: 1 }];
    for (let i = 0; i < 4; i++) hills.push({ x: r(), y: r(), s: .1 + r() * .14, h: .2 + r() * .4 });

    const f = new Float32Array(cols * rows);
    let lo = Infinity, hi = -Infinity, top = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cell / w, y = j * cell / h;
        let v = .3 * fbm2(n, x * 3.2 * aspect, y * 3.2);
        if (coast) v += x * 1.1 - .25 + .2 * Math.exp(-((x - .82) ** 2) / .04);
        else for (const b of hills) v += b.h * Math.exp(-(((x - b.x) * aspect) ** 2 + (y - b.y) ** 2) / (b.s * b.s));
        const k = j * cols + i;
        f[k] = v;
        if (v < lo) lo = v;
        if (v > hi) { hi = v; top = k; }
      }
    }
    for (let k = 0; k < f.length; k++) f[k] = low + (f[k] - lo) / (hi - lo) * (peak - low);

    const levels = [];
    for (let lv = Math.ceil(low / 50) * 50; lv <= peak; lv += 50) {
      if (lv < 0) continue;
      const path = new Path2D();
      trace(path, f, cols, rows, cell, lv);
      levels.push({ lv, path, index: lv % 250 === 0 });
    }
    const grownLine = new Path2D();
    trace(grownLine, f, cols, rows, cell, grown);

    let water = null;
    if (coast) {
      // Open water gets ruled lines, the way old survey sheets did it.
      water = new Path2D();
      for (let j = 1; j < rows; j += 2) {
        let start = -1;
        for (let i = 0; i < cols; i++) {
          const wet = f[j * cols + i] < 0;
          if (wet && start < 0) start = i;
          if ((!wet || i === cols - 1) && start >= 0) {
            water.moveTo(start * cell, j * cell);
            water.lineTo((wet ? i : i - 1) * cell, j * cell);
            start = -1;
          }
        }
      }
    }

    // Pin the grown-at label where that line passes closest to the lower right.
    let pin = null, best = Infinity;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i], b = f[j * cols + i + 1];
        if ((a - grown) * (b - grown) >= 0) continue;
        const x = (i + (grown - a) / (b - a)) * cell, y = j * cell;
        const dist = (x - w * .7) ** 2 + (y - h * .72) ** 2;
        if (dist < best) { best = dist; pin = [x, y]; }
      }
    }

    const summit = coast ? null : [(top % cols) * cell, Math.floor(top / cols) * cell];
    art = { ctx, w, h, low, peak, grown, coast, levels, grownLine, water, pin, summit };
    artShown = -1;
  }

  // Contours fill in from the valley floor up. The heavy line lands when the climb reaches
  // the altitude the coffee grows at, and the summit is marked last.
  function paintPlate(p) {
    const { ctx, w, h, low, peak, grown, coast, levels, grownLine, water, pin, summit } = art;
    const reach = low + p * (peak - low);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, w, h);
    ctx.lineJoin = ctx.lineCap = 'round';

    if (water) {
      ctx.strokeStyle = C.slate;
      ctx.globalAlpha = .3;
      ctx.lineWidth = .8;
      ctx.stroke(water);
    }
    ctx.strokeStyle = C.contour;
    for (const l of levels) {
      if (l.lv > reach) break;
      ctx.globalAlpha = l.index ? .9 : .45;
      ctx.lineWidth = l.index ? 1.1 : .7;
      ctx.stroke(l.path);
    }
    ctx.globalAlpha = 1;
    if (coast) {
      if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
      mapLabel(ctx, 'Arabian Sea', w * .06, h * .52, { size: 12 });
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    if (reach >= grown) {
      ctx.strokeStyle = C.deodar;
      ctx.lineWidth = 2.4;
      ctx.stroke(grownLine);
      if (pin) {
        ctx.beginPath();
        ctx.arc(pin[0], pin[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = C.paper;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
        const right = pin[0] > w * .78;
        mapLabel(ctx, coast ? 'sea level' : metres(grown), pin[0] + (right ? -10 : 10), pin[1] + 4, { align: right ? 'right' : 'left', weight: 600 });
      }
    }
    if (summit && p >= 1) {
      const [tx, ty] = summit;
      ctx.fillStyle = C.deodar;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 6);
      ctx.lineTo(tx - 5.5, ty + 4);
      ctx.lineTo(tx + 5.5, ty + 4);
      ctx.fill();
      mapLabel(ctx, metres(peak), tx + 10, ty + 4);
    }

    ctx.strokeStyle = C.deodar;
    ctx.lineWidth = 1;
    ctx.globalAlpha = .8;
    ctx.strokeRect(.5, .5, w - 1, h - 1);
    ctx.globalAlpha = .3;
    ctx.strokeRect(6.5, 6.5, w - 13, h - 13);
    ctx.globalAlpha = 1;
  }

  function showHill(btn, force) {
    if (btn === current && !force) return;
    current = btn;
    for (const b of hillButtons) b.setAttribute('aria-pressed', String(b === btn));
    const d = btn.dataset, coast = d.grown === '0';
    const text = {
      name: $('.hill__name', btn).textContent,
      where: $('.hill__where', btn).textContent,
      altLabel: coast ? 'Monsooned at' : 'Grown at',
      alt: coast ? 'Sea level' : metres(+d.grown),
      process: d.process,
      cup: d.cup,
      story: d.story,
    };
    for (const el of plateFields) el.textContent = text[el.dataset.f];
    buildPlate(d);
    if (!force) artSince = performance.now();
  }
  for (const b of hillButtons) {
    b.addEventListener('click', () => showHill(b));
    b.addEventListener('focus', () => showHill(b));
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showHill(b); });
  }

  // The way up: a sketch map, with the road drawn in as the section scrolls past.
  const visit = $('.visit');
  const terrain = $('.visit__terrain'), routeCanvas = $('.visit__route');
  const ROAD = [[.02, .96], [.12, .9], [.22, .93], [.3, .86], [.24, .78], [.34, .72], [.46, .76], [.52, .67], [.43, .59], [.53, .52], [.64, .56], [.7, .47], [.61, .4], [.7, .33], [.8, .36]];
  const BEYOND = [[.8, .36], [.88, .27], [.84, .17], [.94, .08], [1.02, .02]];
  let road = null, routeP = -1;

  function drawVisit() {
    const { ctx, w, h } = fit(terrain);
    if (!w) return;
    const wide = w > 820;
    const box = wide ? { x: w * .46, y: h * .1, w: w * .5, h: h * .8 } : { x: 20, y: h * .07, w: w - 40, h: h * .86 };
    const cell = 6, cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1, aspect = w / h;
    const n = valueNoise(1480);
    const f = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cell / w, y = j * cell / h;
        f[j * cols + i] = 560 + 1500 * (.62 * (1 - y) + .38 * x) + 760 * (fbm2(n, x * 2.4 * aspect, y * 2.4) - .5);
      }
    }
    ctx.lineJoin = 'round';
    for (let lv = 400; lv < 2800; lv += 40) {
      const index = lv % 200 === 0;
      ctx.beginPath();
      trace(ctx, f, cols, rows, cell, lv);
      ctx.strokeStyle = C.contour;
      ctx.globalAlpha = index ? .5 : .24;
      ctx.lineWidth = index ? 1 : .6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (wide) {
      // Rub the contours out under the text column.
      const fade = ctx.createLinearGradient(0, 0, w * .58, 0);
      fade.addColorStop(0, '#000');
      fade.addColorStop(.6, '#000');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w * .58, h);
      ctx.globalCompositeOperation = 'source-over';
    }

    const place = ([x, y]) => [box.x + x * box.w, box.y + y * box.h];
    const pts = spline(ROAD.map(place), 14);
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    road = { ...fit(routeCanvas), pts, len, beyond: spline(BEYOND.map(place), 10) };
    routeP = -1;
  }

  // Label halos and the road's casing take the page ground so they sit cleanly as it changes colour.
  function paintRoute(p, ground) {
    if (!road) return;
    const { ctx, w, h, pts, len, beyond } = road;
    const trail = list => { ctx.beginPath(); list.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = ctx.lineCap = 'round';

    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(29,43,40,.5)';
    trail(pts);
    ctx.stroke();
    trail(beyond);
    ctx.stroke();
    ctx.setLineDash([]);

    const upto = p * len[len.length - 1], driven = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (len[i] <= upto) { driven.push(pts[i]); continue; }
      const k = (upto - len[i - 1]) / (len[i] - len[i - 1]);
      driven.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
      break;
    }
    if (driven.length > 1) {
      trail(driven);
      ctx.lineWidth = 7;
      ctx.strokeStyle = ground;
      ctx.stroke();
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = C.deodar;
      ctx.stroke();
    }

    const [sx, sy] = pts[0], [hx, hy] = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.deodar;
    ctx.stroke();

    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 36);
    glow.addColorStop(0, 'rgba(240,166,75,.55)');
    glow.addColorStop(1, 'rgba(240,166,75,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(hx - 36, hy - 36, 72, 72);
    ctx.fillStyle = C.deodar;
    ctx.fillRect(hx - 6, hy - 5, 12, 11);
    ctx.beginPath();
    ctx.moveTo(hx - 8.5, hy - 4);
    ctx.lineTo(hx, hy - 12);
    ctx.lineTo(hx + 8.5, hy - 4);
    ctx.fill();
    ctx.fillStyle = C.lamp;
    ctx.fillRect(hx - 3, hy - 1, 4.5, 4.5);

    const halo = { halo: ground };
    mapLabel(ctx, 'Clock tower', sx + 14, sy - 6, { ...halo, weight: 600 });
    mapLabel(ctx, 'Dehradun, 640 m', sx + 14, sy + 11, halo);
    mapLabel(ctx, 'Fogline', hx + 16, hy - 2, { ...halo, weight: 600, size: 15 });
    mapLabel(ctx, '1,480 m', hx + 16, hy + 15, halo);
    const [kx, ky] = beyond[Math.round(beyond.length * .4)];
    mapLabel(ctx, 'Kimadi', kx - 12, ky + 4, { ...halo, align: 'right' });
    const [mx, my] = beyond[beyond.length - 4];
    mapLabel(ctx, 'to Mussoorie', mx - 12, my + 4, { ...halo, align: 'right', size: 12 });

    ctx.strokeStyle = C.deodar;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w - 32, h - 48);
    ctx.lineTo(w - 32, h - 82);
    ctx.moveTo(w - 37, h - 72);
    ctx.lineTo(w - 32, h - 82);
    ctx.lineTo(w - 27, h - 72);
    ctx.stroke();
    mapLabel(ctx, 'N', w - 32, h - 88, { ...halo, align: 'center', weight: 600 });
    mapLabel(ctx, 'Sketch map, not to scale', w - 18, h - 18, { ...halo, align: 'right', size: 12 });
  }

  // One loop reads the scroll position and drives everything that follows it.
  const drive = $('.drive');
  const cup = $('.cup');
  const alt = $('.alt'), altVal = $('.alt__val');
  const bar = $('.bar');
  const mist = $('.mist');
  const themeColor = $('meta[name="theme-color"]');
  const planSvg = $('.plan svg');
  const foot = $('.foot');
  const cues = $$('[data-from]', stage).map(el => ({ el, from: +el.dataset.from, to: el.dataset.to ? +el.dataset.to : Infinity }));
  const fog = makeFog($('.drive__gl'));
  if (fog) document.documentElement.classList.add('gl');
  const viewCanvas = $('.window__view');
  const view = makeFog(viewCanvas, { glass: true });

  // The page ground flows from one section's colour into the next as each rises through the screen.
  const OUTSIDE = rgb(C.fog), INSIDE = rgb(C.decoction);
  // The footer brings its own dusk (a gradient in CSS), so the map above it keeps its fog.
  const flow = [$('#room'), $('.roast'), $('#board'), $('#visit')].map(el => ({ el, ground: el.dataset.tone === 'dark' ? INSIDE : OUTSIDE }));
  const mix = (a, b, m) => a.map((v, i) => v + (b[i] - v) * m);

  // Every line on the page draws itself as it scrolls in.
  for (const el of $$(':is(path, rect, circle):not(.hit, .dash)', planSvg)) el.setAttribute('pathLength', '1');
  const drawn = new Map();
  const setP = (el, p) => { const v = p.toFixed(3); if (drawn.get(el) !== v) { drawn.set(el, v); el.style.setProperty('--p', v); } };
  const rising = (box, vh, from, span) => (reduced ? 1 : clamp((vh * from - box.top) / (vh * span), 0, 1));

  let t = 0, last = performance.now(), slow = 0;
  const shown = {};
  function frame(now) {
    requestAnimationFrame(frame);
    lenis?.raf(now);
    const raw = now - last, dt = Math.min(raw, 100);
    last = now;
    const vh = innerHeight;

    // Read every position first, then write.
    const r = drive.getBoundingClientRect();
    const span = r.height - vh;
    const target = span > 0 ? clamp(-r.top / span, 0, 1) * 3 : 0;
    t = reduced ? target : t + (target - t) * (1 - Math.exp(-dt / (lenis ? 70 : 150)));
    if (Math.abs(target - t) < 1e-4) t = target;
    const live = r.bottom > 0 && r.top < vh;
    const cupBox = live && t > 1.4 ? cup.getBoundingClientRect() : null;
    const stageTop = live ? stage.getBoundingClientRect().top : 0;
    // The header only goes see-through while the stage is pinned, so nothing slides under it.
    const over = r.bottom >= vh - 1 ? 'drive' : 'page';
    let ground = t > 2.2 ? INSIDE : OUTSIDE;
    for (const s of flow) {
      // A short last section can't rise far, so its blend ends where the page does.
      const end = Math.max(vh * .3, vh - s.el.offsetHeight - 1);
      const m = ease(clamp((end + vh * .45 - s.el.getBoundingClientRect().top) / (vh * .45), 0, 1));
      if (!m) break;
      ground = mix(ground, s.ground, m);
    }
    const left = document.documentElement.scrollHeight - vh - scrollY;
    const footTop = foot.getBoundingClientRect().top, underFoot = footTop < 56;
    const planBox = planSvg.getBoundingClientRect(), curveBox = curveSvg.getBoundingClientRect();
    const plateBox = plate.getBoundingClientRect(), v = visit.getBoundingClientRect();
    const viewBox = viewCanvas.getBoundingClientRect();

    const [cr, cg, cb] = ground.map(Math.round);
    const css = `rgb(${cr}, ${cg}, ${cb})`;
    if (shown.ground !== css) {
      shown.ground = css;
      document.body.style.backgroundColor = css;
      mist.style.setProperty('--mist', `rgba(${cr}, ${cg}, ${cb}, .6)`);
    }
    const light = !underFoot && (.2126 * cr + .7152 * cg + .0722 * cb) / 255 > .45;
    const tone = over === 'drive' ? (t > 2.2 ? 'dark' : 'light') : light ? 'light' : 'dark';
    const barGround = over === 'drive' ? 'transparent' : underFoot ? C.deodar : css;
    if (bar.dataset.over !== over) bar.dataset.over = over;
    if (bar.dataset.tone !== tone) bar.dataset.tone = tone;
    if (shown.bar !== barGround) { shown.bar = barGround; bar.style.setProperty('--ground', barGround); }
    const chrome = underFoot ? C.deodar : css;
    if (shown.chrome !== chrome) { shown.chrome = chrome; themeColor.content = chrome; }
    // The mist lifts as the footer rises, so the last lines are never left in it.
    const mistOn = over === 'page' ? Math.min(clamp(left / (vh * .3), 0, 1), clamp((footTop - vh * .75) / (vh * .25), 0, 1)).toFixed(2) : '0';
    if (shown.mist !== mistOn) { shown.mist = mistOn; mist.style.opacity = mistOn; }

    if (view && viewBox.bottom > 0 && viewBox.top < vh) view.render(now, .45);
    setP(planSvg, rising(planBox, vh, .9, .6));
    setP(curveSvg, rising(curveBox, vh, .85, .55));
    setP(foot, reduced ? 1 : 1 - clamp(left / (vh * .35), 0, 1));
    if (art && plateBox.top < vh && plateBox.bottom > 0) {
      let p = ease(rising(plateBox, vh, .95, .5));
      if (artSince && !reduced) p = Math.min(p, ease(clamp((now - artSince) / 900, 0, 1)));
      if (p !== artShown && (Math.abs(p - artShown) > .004 || p === 1)) { artShown = p; paintPlate(p); }
    }

    if (live) {
      for (const c of cues) c.el.classList.toggle('is-on', t >= c.from && t < c.to);
      stage.classList.toggle('is-inside', t > 2.2);
      const a = clamp(t / 2, 0, 1);
      alt.style.setProperty('--a', a.toFixed(4));
      const reading = metres(Math.round((640 + 840 * a) / 10) * 10);
      if (altVal.textContent !== reading) altVal.textContent = reading;
      if (fog) {
        fog.render(now, t, cupBox, stageTop);
        // Slow frames lower the fog's resolution; long stalls (a background tab) don't count.
        if (raw > 26 && raw < 1000) {
          slow += raw > 100 ? 8 : 1;
          if (slow > 45) { slow = 0; fog.degrade(); }
        } else if (slow) slow--;
      }
    }
    if (v.top < vh && v.bottom > 0) {
      const p = reduced ? 1 : clamp((vh * .9 - v.top) / (v.height * .7), 0, 1);
      if (Math.abs(p - routeP) > .002 || shown.route !== css) { routeP = p; shown.route = css; paintRoute(p, css); }
    }
  }

  function redraw() {
    drawCurve();
    buildPlate(current.dataset);
    drawVisit();
  }

  let seen = [innerWidth, innerHeight], timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fog?.resize();
      view?.resize();
      const [w0, h0] = seen;
      seen = [innerWidth, innerHeight];
      if (innerWidth !== w0 || Math.abs(innerHeight - h0) > 120) redraw();
    }, 150);
  });

  paintStatus();
  setInterval(paintStatus, 30e3);
  showHill(current, true);
  drawCurve();
  drawVisit();
  document.fonts?.ready.then(redraw);
  requestAnimationFrame(frame);
})();
