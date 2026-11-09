// living-sign/parkScene.ts
var PARK_DEFAULTS = { density: 1, wind: 1, speed: 1, sun: 1, walkers: true, animate: true };
var W = 1774;
var H = 887;
var VP = { x: 1003, y: 600 };
var WALKERS = {
  A: { ax: 0, w: 15, h: 36, feet: 34, cx: 7.1, d0: 27, X: -0.44 },
  B: { ax: 17, w: 11, h: 31, feet: 29, cx: 4.8, d0: 24, X: 0.42 }
};
var PALETTE = [[242, 168, 32], [236, 128, 14], [223, 92, 10], [205, 70, 8], [178, 54, 10], [150, 34, 14]];
var SHAPES = [
  ["##", "#-"],
  [".#", "#-", "#."],
  [".#.", "##-", ".#."],
  [".##", "#-#", "#-."],
  ["..#.", ".##-", "##-.", ".#.."]
];
var LAMPS = [[640, 425, 26], [1515, 330, 34], [745, 483, 16], [820, 510, 12], [1238, 490, 16], [1180, 520, 12]];
var SHAFTS = [
  { t: 1012, tw: 16, b: 760, bw: 80, ph: 0 },
  { t: 1046, tw: 14, b: 1165, bw: 90, ph: 1.7 },
  { t: 986, tw: 12, b: 560, bw: 70, ph: 3.1 },
  { t: 1070, tw: 12, b: 1430, bw: 70, ph: 4.4 }
];
function makePark(wrap, canvas, urls, initial) {
  const S = { ...PARK_DEFAULTS, ...initial || {} };
  const ctx = canvas.getContext("2d");
  const reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const rnd = Math.random;
  const R = (a, b) => a + rnd() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mk = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  let dead = false, raf = 0, active = true, visible = !document.hidden, onScreen = true, ready = false;
  let sized = false;
  let viewScale = 0.36;
  let rs = 1;
  const imgs = {};
  let pending = 3;
  ["base", "canopy", "walkers"].forEach((k) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      if (--pending === 0) init();
    };
    im.src = urls[k];
    imgs[k] = im;
  });
  function resize() {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const next = clamp(r.width * dpr / W, 0.3, 1);
    if (r.width > 0) {
      viewScale = r.width / W;
      cell = clamp(Math.sqrt(r.width / 632), 0.75, 1.4);
    }
    if (sized && Math.abs(next - rs) < 0.02) return;
    sized = true;
    rs = next;
    canvas.width = Math.round(W * rs);
    canvas.height = Math.round(H * rs);
    if (ready) renderStill();
  }
  const ro = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
  ro?.observe(wrap);
  const sprites = [], backs = [];
  const SPR_PER_SHAPE = PALETTE.length;
  function buildSprites() {
    for (const side of [1, 0]) SHAPES.forEach((rows) => {
      PALETTE.forEach((c0) => {
        const c = side ? c0 : [c0[0] * 0.84, c0[1] * 0.66, c0[2] * 0.7];
        const h = rows.length, w = rows[0].length, cv = mk(w, h), x = cv.getContext("2d");
        const id = x.createImageData(w, h);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const ch = rows[yy][xx];
          if (ch === ".") continue;
          const k = ch === "-" ? 0.82 : 1, o = (yy * w + xx) * 4;
          id.data[o] = Math.min(255, c[0] * k);
          id.data[o + 1] = Math.min(255, c[1] * k);
          id.data[o + 2] = Math.min(255, c[2] * k);
          id.data[o + 3] = 255;
        }
        x.putImageData(id, 0, 0);
        (side === 1 ? sprites : backs).push(cv);
      });
    });
  }
  const TILE = 24;
  let tiles = [];
  let sources = [];
  let groundShade = new Uint8Array(0);
  function scanCanopy() {
    const sw = Math.ceil(W / 6), sh = Math.ceil(600 / 6);
    const c = mk(sw, sh), x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(imgs.canopy, 0, 0, W, 600, 0, 0, sw, sh);
    let data = null;
    try {
      data = x.getImageData(0, 0, sw, sh).data;
    } catch (e) {
      data = null;
    }
    const has = (px, py) => !data || data[((py | 0) * sw + (px | 0)) * 4 + 3] > 90;
    const dist = (px, py) => clamp(Math.hypot((px - VP.x) / 900, (py - VP.y) / 620), 0, 1);
    tiles = [];
    for (let ty = 0; ty < 600; ty += TILE) for (let tx = 0; tx < W; tx += TILE) {
      let any = false;
      for (let sy = ty; sy < ty + TILE && !any; sy += 6) for (let sx = tx; sx < tx + TILE && !any; sx += 6) if (sy < 600 && has(sx / 6, sy / 6)) any = true;
      if (any) tiles.push({ x: tx, y: ty, d: dist(tx + TILE / 2, ty + TILE / 2) });
    }
    sources = [];
    for (let py = 2; py < sh; py += 2) for (let px = 1; px < sw; px += 2) if (has(px, py)) sources.push({ x: px * 6, y: py * 6, d: dist(px * 6, py * 6) });
    groundShade = new Uint8Array(0);
  }
  const PERM = new Uint8Array(512), GR = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    PERM[i] = i;
    GR[i] = rnd();
  }
  for (let i = 255; i > 0; i--) {
    const j = rnd() * (i + 1) | 0;
    const t2 = PERM[i];
    PERM[i] = PERM[j];
    PERM[j] = t2;
  }
  for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i];
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = GR[PERM[(xi & 255) + PERM[yi & 255]]], b = GR[PERM[(xi + 1 & 255) + PERM[yi & 255]]];
    const c = GR[PERM[(xi & 255) + PERM[yi + 1 & 255]]], d = GR[PERM[(xi + 1 & 255) + PERM[yi + 1 & 255]]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  let t = 0, windPhase = 0, gustT0 = -99, gustDir = 1, gustPow = 1, nextGust = R(5, 9);
  function gustEnv(tt) {
    const a = tt - gustT0;
    if (a < 0) return 0;
    return (1 - Math.exp(-a / 0.9)) * Math.exp(-a / 2.6) * 1.9 * gustPow;
  }
  function windAt(x) {
    const base = 0.42 + 0.22 * Math.sin(t * 0.13) + 0.12 * Math.sin(t * 0.37 + 1.1) + 0.06 * Math.sin(t * 0.91 + 2);
    const lag = gustDir > 0 ? x / 750 : (W - x) / 750;
    return S.wind * (base + gustEnv(t - lag) * gustDir);
  }
  const air = [], rest = [];
  let perf = 1;
  let lastSpawn = -99, moodSeed = R(0, 100);
  const smooth = (a) => a * a * (3 - 2 * a);
  function fallMood() {
    const m = noise(t * 0.03 + moodSeed, 3.7) * 0.75 + noise(t * 0.11 + moodSeed, 9.1) * 0.25;
    return smooth(clamp((m - 0.2) / 0.55, 0, 1));
  }
  const airTarget = () => {
    const g = clamp(gustEnv(t), 0, 1);
    return Math.round((fallMood() * 5.6 + g * 1.4) * S.density);
  };
  function pickColour() {
    return rnd() < 0.6 ? 2 + (rnd() * 4 | 0) : rnd() * 2 | 0;
  }
  function groundFor(k) {
    return 616 + Math.pow(k, 1.6) * 236 + R(-8, 10);
  }
  function newLeaf() {
    if (!sources.length) return null;
    let s = sources[rnd() * sources.length | 0];
    for (let i = 0; i < 10 && (s.y > 470 || s.d < 0.16 || s.x > W - 220); i++) s = sources[rnd() * sources.length | 0];
    if (s.y > 470 || s.d < 0.16) return null;
    let k = clamp((s.d - 0.16) / 0.84, 0, 1) * 0.8 + R(-0.12, 0.12);
    if (rnd() < 0.12 && s.d > 0.6) k = R(0.85, 1);
    k = clamp(k, 0, 1);
    const shape = k < 0.35 ? rnd() * 2 | 0 : k < 0.75 ? 1 + (rnd() * 3 | 0) : 2 + (rnd() * 3 | 0);
    const sp = 0.75 + k * 0.7;
    return {
      x: s.x + R(-5, 5),
      y: s.y + R(0, 6),
      vx: 0,
      vy: 0,
      k,
      spr: shape * SPR_PER_SHAPE + pickColour(),
      ang: R(-0.6, 0.6),
      spinBase: R(-0.5, 0.5),
      tum: R(0, 6.28),
      tumS: R(1.2, 2.6),
      swing: R(0, 6.28),
      swingW: R(1.1, 1.9),
      swingA: R(14, 30) * sp,
      fall: R(30, 48) * sp,
      sp,
      drift: R(-6, 6),
      seed: R(0, 100),
      spiral: 0,
      spiralR: 0,
      nextTwist: R(2.5, 7),
      groundY: groundFor(k),
      state: 0,
      life: 0,
      restFor: R(5, 12),
      alpha: 0,
      fade: 0
    };
  }
  function seedAir() {
    const n = Math.min(2, airTarget());
    for (let i = 0; i < n; i++) {
      const l = newLeaf();
      if (!l) return;
      l.life = 2 + R(0, 3);
      l.alpha = 1;
      l.vy = l.fall;
      l.y += (l.groundY - l.y) * R(0.15, 0.6);
      air.push(l);
    }
  }
  function updateLeaves(dt) {
    if (air.length < airTarget() && t - lastSpawn > R(1.4, 3.5) && rnd() < dt * 0.8) {
      const l = newLeaf();
      if (l) {
        air.push(l);
        lastSpawn = t;
      }
    }
    for (let i = air.length - 1; i >= 0; i--) {
      const l = air[i];
      l.life += dt;
      const detach = smooth(clamp(l.life / 1.6, 0, 1));
      l.alpha = Math.min(1, l.life / 0.9);
      if (l.fade) {
        l.alpha = Math.max(0, 1 - (l.life - l.fade) / 1.2);
        if (l.alpha <= 0) {
          air.splice(i, 1);
          continue;
        }
      }
      const eddy = (noise(l.life * 0.35 + l.seed, l.seed) - 0.5) * 2;
      const wantVx = (windAt(l.x) * 17 + l.drift + eddy * 12) * l.sp * detach;
      l.vx += (wantVx - l.vx) * Math.min(1, dt * 0.9);
      l.swing += l.swingW * dt;
      const sw = Math.sin(l.swing), cw = Math.cos(l.swing);
      const wantVy = l.fall * (0.55 + 0.6 * cw * cw) * detach;
      l.vy += (wantVy - l.vy) * Math.min(1, dt * 1.6);
      let sx = cw * l.swingA * l.swingW * detach;
      if (!l.spiral && l.life > l.nextTwist) {
        if (rnd() < 0.45) {
          l.spiral = l.life;
          l.spiralR = R(8, 16) * l.sp;
        }
        l.nextTwist = l.life + R(4, 9);
      }
      let tumS = l.tumS, slow = 1;
      if (l.spiral) {
        const a = l.life - l.spiral, dur = 2.6;
        if (a > dur) l.spiral = 0;
        else {
          const env = Math.sin(a / dur * Math.PI);
          sx += -Math.sin(a * 4.2) * l.spiralR * 4.2 * env;
          slow = 1 - 0.35 * env;
          tumS = l.tumS + 4 * env;
        }
      }
      l.x += (l.vx + sx) * dt;
      l.y += l.vy * slow * dt;
      l.ang = sw * 0.55 + l.spinBase * l.life;
      l.tum += tumS * dt;
      if (l.x < -30 || l.x > W + 30) {
        if (!l.fade) l.fade = l.life;
        continue;
      }
      if (l.y >= l.groundY) {
        air.splice(i, 1);
        l.state = 1;
        l.y = l.groundY;
        l.life = 0;
        l.vx *= 0.3;
        l.alpha = 1;
        rest.push(l);
      }
    }
    for (let i = rest.length - 1; i >= 0; i--) {
      const l = rest[i];
      l.life += dt;
      l.x += l.vx * dt;
      l.vx *= Math.pow(0.08, dt);
      l.tum += (Math.round(l.tum / Math.PI) * Math.PI - l.tum) * Math.min(1, dt * 4);
      if (l.life > l.restFor) {
        l.alpha -= dt / 4;
        if (l.alpha <= 0) rest.splice(i, 1);
      }
    }
  }
  let cell = 1;
  function drawLeaf(l) {
    const turn = Math.cos(l.tum);
    const spr = (turn < 0 ? backs : sprites)[l.spr];
    const size = (1 + l.k * 0.9) * cell / viewScale;
    const sxk = Math.sign(turn || 1) * Math.max(0.3, Math.abs(turn));
    const flat = l.state === 1 ? 0.6 : 1;
    ctx.globalAlpha = l.alpha * (0.72 + 0.28 * l.k);
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.translate(l.x, l.y);
    ctx.rotate(l.ang);
    ctx.scale(sxk * size, size * flat);
    ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
  }
  const FX = 4, fw = Math.ceil(W / FX), fh = Math.ceil(H / FX);
  const dapple = mk(fw, fh), dctx = dapple.getContext("2d");
  const dimg = dctx.createImageData(fw, fh);
  const shafts = mk(fw, fh), sctx = shafts.getContext("2d");
  let lastDapple = -1, lastShaft = -1;
  const GROUND_Y0 = 606;
  function updateDapple() {
    const d = dimg.data;
    const y0 = Math.floor(GROUND_Y0 / FX);
    const sun = S.sun;
    for (let ey = y0; ey < fh; ey++) {
      const y = ey * FX + 2, dy = y - VP.y;
      const fade = clamp((dy - 8) / 60, 0, 1);
      const v = 260 / dy;
      for (let ex = 0; ex < fw; ex++) {
        const x = ex * FX + 2, r = Math.abs(x - VP.x) / dy;
        const fan = clamp((3.4 - r) / 1.1, 0, 1);
        const o0 = (ey * fw + ex) * 4;
        if (fan <= 0) {
          d[o0 + 3] = 0;
          continue;
        }
        const u = (x - VP.x) / dy * 0.8;
        const n = noise(u * 1.1 + windPhase, v * 0.9) * 0.62 + noise(u * 2.6 - windPhase * 1.4 + 9, v * 2.1 + t * 0.05) * 0.38;
        const o = (ey * fw + ex) * 4;
        const lit = clamp((n - 0.56) / 0.14, 0, 1), sh = clamp((0.44 - n) / 0.14, 0, 1);
        if (lit > 0) {
          d[o] = 255;
          d[o + 1] = 196;
          d[o + 2] = 118;
          d[o + 3] = 58 * lit * sun * fade * fan;
        } else if (sh > 0) {
          d[o] = 52;
          d[o + 1] = 24;
          d[o + 2] = 10;
          d[o + 3] = 50 * sh * fade * fan * (0.6 + 0.4 * sun);
        } else d[o + 3] = 0;
      }
    }
    dctx.putImageData(dimg, 0, 0);
  }
  function updateShafts() {
    sctx.clearRect(0, 0, fw, fh);
    sctx.globalCompositeOperation = "lighter";
    for (const s of SHAFTS) {
      const breathe = 0.6 + 0.4 * Math.sin(t * 0.09 + s.ph) + 0.12 * Math.sin(t * 1.3 + s.ph * 2) * (0.5 + gustEnv(t));
      const a = 0.075 * S.sun * clamp(breathe, 0, 1.3);
      if (a < 4e-3) continue;
      const sway = Math.sin(t * 0.21 + s.ph) * 14;
      const g = sctx.createLinearGradient(0, 0, 0, 780 / FX);
      g.addColorStop(0, "rgba(255,214,150," + a.toFixed(3) + ")");
      g.addColorStop(0.55, "rgba(255,190,110," + (a * 0.55).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,180,100,0)");
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.moveTo((s.t - s.tw) / FX, 0);
      sctx.lineTo((s.t + s.tw) / FX, 0);
      sctx.lineTo((s.b + sway + s.bw) / FX, 780 / FX);
      sctx.lineTo((s.b + sway - s.bw) / FX, 780 / FX);
      sctx.closePath();
      sctx.fill();
    }
    sctx.globalCompositeOperation = "source-over";
  }
  const glints = [];
  function updateGlints() {
    const want = 9 * S.sun * perf * (1 + gustEnv(t));
    if (glints.length < want && sources.length && rnd() < 0.25) {
      const s = sources[rnd() * sources.length | 0];
      if (s.d > 0.25) glints.push({ x: s.x, y: s.y, t0: t, life: R(0.5, 1.3) });
    }
    for (let i = glints.length - 1; i >= 0; i--) if (t - glints[i].t0 > glints[i].life) glints.splice(i, 1);
  }
  const walkers = [
    { id: "A", Z: 1 / WALKERS.A.d0, X: WALKERS.A.X, dir: 1, v: R(12e-4, 15e-4), ph: 0, born: -99, fadeOut: 0 },
    { id: "B", Z: 1 / WALKERS.B.d0, X: WALKERS.B.X, dir: 1, v: R(1e-3, 13e-4), ph: 0.5, born: -99, fadeOut: 0 }
  ];
  let nextWalker = R(10, 18);
  function updateWalkers(dt) {
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      w.Z += w.dir * w.v * dt;
      const d = 1 / w.Z;
      if (w.dir > 0 && d < 6.5 || w.dir < 0 && d > 38) {
        w.fadeOut += dt;
        if (w.fadeOut > 3) walkers.splice(i, 1);
      }
    }
    if (t > nextWalker && walkers.length < 4) {
      const toward = rnd() < 0.55;
      const id = rnd() < 0.5 ? "A" : "B";
      walkers.push({ id, Z: toward ? 1 / 6.5 : 1 / R(22, 28), X: R(-0.7, 0.7), dir: toward ? -1 : 1, v: R(1e-3, 16e-4), ph: R(0, 1), born: t, fadeOut: 0 });
      nextWalker = t + R(12, 22);
    }
  }
  function drawWalker(w, still) {
    const P = WALKERS[w.id], d = 1 / w.Z, k = d / P.d0;
    let a = 1;
    if (w.born > -50) a = Math.min(a, clamp((t - w.born) / 3.5, 0, 1));
    a = Math.min(a, 1 - w.fadeOut / 3);
    a *= clamp((d - 5) / 4, 0, 1);
    if (a <= 0) return;
    const fx = VP.x + w.X * d, fy = VP.y + d;
    const step = still ? 0 : (t * 1.9 + w.ph) % 1;
    const half = step < 0.5;
    const bob = still ? 0 : Math.abs(Math.sin(step * Math.PI * 2)) > 0.7 ? -1 : 0;
    const split = Math.round(P.h * 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(fx, fy);
    ctx.scale(k, k);
    ctx.drawImage(imgs.walkers, P.ax, 0, P.w, split, -P.cx, -P.feet + bob, P.w, split);
    ctx.save();
    if (!still && half) {
      ctx.translate(-P.cx + P.w / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(P.cx - P.w / 2, 0);
    }
    ctx.drawImage(imgs.walkers, P.ax, split, P.w, P.h - split, -P.cx, -P.feet + split + bob * 0.5, P.w, P.h - split);
    ctx.restore();
    ctx.restore();
  }
  let bird = null, nextBird = R(9, 18);
  function updateBird(dt) {
    if (!bird && t > nextBird) {
      const ltr = rnd() < 0.5;
      bird = { x: ltr ? 780 : 1230, y: R(300, 430), vx: (ltr ? 1 : -1) * R(70, 100), t0: t, base: 0 };
      bird.base = bird.y;
    }
    if (bird) {
      bird.x += bird.vx * dt;
      bird.y = bird.base + Math.sin((t - bird.t0) * 3.2) * 10 - (t - bird.t0) * 6;
      if (bird.x < 760 || bird.x > 1250) {
        bird = null;
        nextBird = t + R(16, 32);
      }
    }
  }
  function drawBird() {
    if (!bird) return;
    const up = Math.sin((t - bird.t0) * 18) > 0;
    const p = 2, x = Math.round(bird.x), y = Math.round(bird.y);
    const edge = clamp(Math.min(bird.x - 760, 1250 - bird.x) / 40, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.85 * edge;
    ctx.fillStyle = "rgb(62,34,18)";
    ctx.fillRect(x - p / 2, y, p, p);
    if (up) {
      ctx.fillRect(x - p * 2, y - p, p * 1.5, p);
      ctx.fillRect(x + p, y - p, p * 1.5, p);
    } else {
      ctx.fillRect(x - p * 2.5, y + p * 0.5, p * 2, p * 0.7);
      ctx.fillRect(x + p * 0.5, y + p * 0.5, p * 2, p * 0.7);
    }
    ctx.restore();
  }
  function drawCanopy(still) {
    if (still) {
      ctx.drawImage(imgs.canopy, 0, 0);
      return;
    }
    for (let i = 0; i < tiles.length; i++) {
      const tl = tiles[i];
      const cx = tl.x + TILE / 2, cy = tl.y + TILE / 2;
      const amp = 0.25 + 2.3 * Math.pow(tl.d, 1.4);
      const w = windAt(cx);
      const f = 0.85 + 0.35 * Math.sin(cx * 21e-4 + cy * 13e-4);
      const sway = Math.sin(t * f + cx * 6e-3 + cy * 4e-3) * 0.55 + Math.sin(t * f * 2.3 + cx * 0.011 - cy * 7e-3) * 0.2 + w * 0.65;
      const dx = amp * sway, dy = amp * 0.32 * Math.sin(t * f * 1.6 + cx * 8e-3);
      ctx.drawImage(imgs.canopy, tl.x, tl.y, TILE, TILE, tl.x + dx, tl.y + dy, TILE, TILE);
    }
  }
  function render(dt, still) {
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(imgs.base, 0, 0);
    if (still) {
      ctx.drawImage(imgs.walkers, WALKERS.A.ax, 0, WALKERS.A.w, WALKERS.A.h, 984, 593, WALKERS.A.w, WALKERS.A.h);
      ctx.drawImage(imgs.walkers, WALKERS.B.ax, 0, WALKERS.B.w, WALKERS.B.h, 1008, 595, WALKERS.B.w, WALKERS.B.h);
      return;
    }
    drawCanopy(false);
    if (t - lastDapple > 1 / (perf > 0.7 ? 24 : 12)) {
      updateDapple();
      lastDapple = t;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dapple, 0, 0, fw, fh, 0, 0, fw * FX, fh * FX);
    const hz = ctx.createRadialGradient(VP.x, VP.y - 30, 0, VP.x, VP.y - 30, 230);
    const ha = (0.06 + 0.035 * Math.sin(t * 0.07)) * S.sun;
    hz.addColorStop(0, "rgba(255,210,150," + ha.toFixed(3) + ")");
    hz.addColorStop(1, "rgba(255,200,140,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = hz;
    ctx.fillRect(VP.x - 230, VP.y - 260, 460, 460);
    for (let i = 0; i < LAMPS.length; i++) {
      const L = LAMPS[i], a = 0.07 + 0.03 * Math.sin(t * 0.5 + i * 1.9);
      const g = ctx.createRadialGradient(L[0], L[1], 0, L[0], L[1], L[2] * 1.6);
      g.addColorStop(0, "rgba(255,230,170," + a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,220,160,0)");
      ctx.fillStyle = g;
      ctx.fillRect(L[0] - L[2] * 1.6, L[1] - L[2] * 1.6, L[2] * 3.2, L[2] * 3.2);
    }
    if (t - lastShaft > 1 / 15) {
      updateShafts();
      lastShaft = t;
    }
    ctx.drawImage(shafts, 0, 0, fw, fh, 0, 0, fw * FX, fh * FX);
    for (const gl of glints) {
      const a = Math.sin((t - gl.t0) / gl.life * Math.PI) * 0.4 * Math.min(1, S.sun);
      ctx.fillStyle = "rgba(255,238,190," + a.toFixed(3) + ")";
      ctx.fillRect(Math.round(gl.x / 3) * 3, Math.round(gl.y / 3) * 3, 3, 3);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    for (const l of rest) drawLeaf(l);
    for (const l of air) if (l.k < 0.45) drawLeaf(l);
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.globalAlpha = 1;
    for (const w of walkers) drawWalker(w, !S.walkers);
    ctx.imageSmoothingEnabled = false;
    drawBird();
    ctx.imageSmoothingEnabled = true;
    for (const l of air) if (l.k >= 0.45) drawLeaf(l);
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.globalAlpha = 1;
  }
  function renderStill() {
    if (ready) render(0, true);
  }
  let last = 0, frames = 0, msAcc = 0;
  function frame(now) {
    raf = 0;
    if (dead) return;
    const raw = last ? Math.min(0.05, (now - last) / 1e3) : 0.016;
    last = now;
    frames++;
    msAcc += raw * 1e3;
    if (frames >= 90) {
      const avg = msAcc / frames;
      if (avg > 24 && perf > 0.4) perf = Math.max(0.4, perf * 0.82);
      else if (avg < 15 && perf < 1) perf = Math.min(1, perf * 1.08);
      frames = 0;
      msAcc = 0;
    }
    const dt = raw * S.speed;
    t += dt;
    windPhase += dt * (0.05 + 0.11 * Math.abs(windAt(VP.x)));
    if (t > nextGust) {
      gustT0 = t;
      gustDir = rnd() < 0.72 ? 1 : -1;
      gustPow = R(0.7, 1.25);
      nextGust = t + R(8, 17) / Math.max(0.35, S.wind);
    }
    updateLeaves(dt);
    if (S.walkers) updateWalkers(dt);
    updateGlints();
    updateBird(dt);
    render(dt, false);
    schedule();
  }
  function running() {
    return ready && !dead && active && visible && onScreen && S.animate && !(reduceMQ && reduceMQ.matches);
  }
  function schedule() {
    if (!raf && running()) raf = requestAnimationFrame(frame);
  }
  function sync() {
    if (!ready) return;
    if (running()) {
      last = 0;
      schedule();
    } else {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (!S.animate || reduceMQ && reduceMQ.matches) renderStill();
    }
  }
  function init() {
    if (dead) return;
    buildSprites();
    scanCanopy();
    seedAir();
    ready = true;
    resize();
    renderStill();
    canvas.style.opacity = "1";
    sync();
  }
  const onVis = () => {
    visible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVis);
  reduceMQ?.addEventListener?.("change", sync);
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => {
    onScreen = es[0].isIntersecting;
    sync();
  }) : null;
  io?.observe(wrap);
  void groundShade;
  return {
    setActive(on) {
      active = !!on;
      sync();
    },
    set(next) {
      const prevDensity = S.density;
      Object.assign(S, next);
      if (next.density !== void 0 && next.density < prevDensity) {
        for (let i = air.length - 1; i >= airTarget(); i--) if (!air[i].fade) air[i].fade = air[i].life;
      }
      sync();
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      reduceMQ?.removeEventListener?.("change", sync);
      io?.disconnect();
      ro?.disconnect();
    }
  };
}
export {
  PARK_DEFAULTS,
  makePark
};
