/**
 * Central Park, The Mall, November afternoon: a living pixel-art painting.
 *
 * The artwork is the picture. Everything else is drawn on top of it, in the artwork's own coordinate
 * space (1774 x 887), and scaled to whatever size the hero box is:
 *
 *   1. base       the original painting (the two nearest walkers lifted out so they can walk)
 *   2. canopy     the foliage, drawn in small tiles that sway on a smooth wind field
 *   3. ground     dappled sun and shade sliding over the path, in perspective
 *   4. light      soft shafts of sun through the gap in the canopy, glints between leaves, warm haze
 *   5. walkers    the tiny figures near the vanishing point, walking with a two-step gait
 *   6. leaves     a few small leaves at a time that let go, rock, drift, sometimes spiral, land and fade
 *   7. bird       now and then, a small bird crossing between the distant trees
 *   8. squirrel   an Eastern gray squirrel that pops out from under the near-left bench every half minute
 *
 * Framework-free. Use makePark() from React, Vue, or plain DOM.
 */

export interface ParkAssets { base: string; canopy: string; walkers: string }
export interface ParkSettings {
  /** leaf multiplier, 0 to 2 (1 = 0 to 6 leaves in the air, drifting between lulls and a few) */
  density: number;
  /** wind strength, 0 to 2 */
  wind: number;
  /** animation speed, 0.25 to 2 */
  speed: number;
  /** sunlight intensity, 0 to 2 */
  sun: number;
  /** animate the distant walkers */
  walkers: boolean;
  /** master switch: false shows the still painting */
  animate: boolean;
}
export interface ParkScene {
  setActive(on: boolean): void;
  set(next: Partial<ParkSettings>): void;
  destroy(): void;
}

export const PARK_DEFAULTS: ParkSettings = { density: 1, wind: 1, speed: 1, sun: 1, walkers: true, animate: true };

type Leaf = {
  x: number; y: number; vx: number; vy: number; k: number; spr: number; ang: number; spinBase: number; tum: number; tumS: number;
  swing: number; swingW: number; swingA: number; fall: number; sp: number; drift: number; seed: number;
  spiral: number; spiralR: number; nextTwist: number; groundY: number;
  state: 0 | 1; // 0 falling, 1 resting on the ground
  life: number; restFor: number; alpha: number; fade: number;
};
type Walker = { id: 'A' | 'B'; Z: number; X: number; dir: number; v: number; ph: number; born: number; fadeOut: number };
type Glint = { x: number; y: number; t0: number; life: number };

const W = 1774, H = 887;
const VP = { x: 1003, y: 600 };
const WALKERS = {
  A: { ax: 0, w: 15, h: 36, feet: 34, cx: 7.1, d0: 27, X: -0.44 },
  B: { ax: 17, w: 11, h: 31, feet: 29, cx: 4.8, d0: 24, X: 0.42 },
};
// sampled from the painting: golden yellow, amber, burnt orange, rust, deep red
const PALETTE: number[][] = [[242, 168, 32], [236, 128, 14], [223, 92, 10], [205, 70, 8], [178, 54, 10], [150, 34, 14]];
// small leaf shapes in art pixels: # body, - a slightly darker vein side (no outlines, no highlights)
const SHAPES = [
  ['##', '#-'],
  ['.#', '#-', '#.'],
  ['.#.', '##-', '.#.'],
  ['.##', '#-#', '#-.'],
  ['..#.', '.##-', '##-.', '.#..'],
  ['.#.#.', '#####', '.##-.', '..-..'],
];
const LAMPS = [[640, 425, 26], [1515, 330, 34], [745, 483, 16], [820, 510, 12], [1238, 490, 16], [1180, 520, 12]];
const SHAFTS = [
  { t: 1012, tw: 16, b: 760, bw: 80, ph: 0.0 },
  { t: 1046, tw: 14, b: 1165, bw: 90, ph: 1.7 },
  { t: 986, tw: 12, b: 560, bw: 70, ph: 3.1 },
  { t: 1070, tw: 12, b: 1430, bw: 70, ph: 4.4 },
];

export function makePark(wrap: HTMLElement, canvas: HTMLCanvasElement, urls: ParkAssets, initial?: Partial<ParkSettings>): ParkScene {
  const S: ParkSettings = { ...PARK_DEFAULTS, ...(initial || {}) };
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const rnd = Math.random;
  const R = (a: number, b: number) => a + rnd() * (b - a);
  const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
  const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  let dead = false, raf = 0, active = true, visible = !document.hidden, onScreen = true, ready = false;
  let sized = false;
  let viewScale = 0.36; // css px per art px
  let rs = 1; // render scale (canvas px per art px)

  // ---------- assets ----------
  const imgs = {} as Record<keyof ParkAssets, HTMLImageElement>;
  let pending = 3;
  (['base', 'canopy', 'walkers'] as const).forEach((k) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { if (--pending === 0) init(); };
    im.src = urls[k]; imgs[k] = im;
  });

  // ---------- sizing: draw in art coordinates, render at the resolution the box actually needs ----------
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const next = clamp((r.width * dpr) / W, 0.3, 1);
    if (r.width > 0) { viewScale = r.width / W; cell = clamp(Math.sqrt(r.width / 632), 0.75, 1.4); }
    if (sized && Math.abs(next - rs) < 0.02) return;
    sized = true;
    rs = next;
    canvas.width = Math.round(W * rs); canvas.height = Math.round(H * rs);
    if (ready) { prescale(); renderStill(); }
  }
  // The painting and its foliage layer are resampled once per size, not every frame. Downscaling a
  // 1774px image 60 times a second is the single most expensive thing a canvas can be asked to do.
  let baseS: HTMLCanvasElement | null = null, canS: HTMLCanvasElement | null = null;
  function prescale() {
    const bw = Math.round(W * rs), bh = Math.round(H * rs), ch = Math.round(600 * rs);
    baseS = mk(bw, bh); canS = mk(bw, ch);
    const b = baseS.getContext('2d') as CanvasRenderingContext2D, c = canS.getContext('2d') as CanvasRenderingContext2D;
    b.imageSmoothingQuality = 'high'; c.imageSmoothingQuality = 'high';
    b.drawImage(imgs.base, 0, 0, bw, bh);
    c.drawImage(imgs.canopy, 0, 0, W, 600, 0, 0, bw, ch);
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  ro?.observe(wrap);

  // ---------- leaf sprites ----------
  // each leaf has a sunlit face and a darker underside; as it turns, the two alternate like a real leaf
  const sprites: HTMLCanvasElement[] = [], backs: HTMLCanvasElement[] = [];
  const SPR_PER_SHAPE = PALETTE.length;
  function buildSprites() {
    for (const side of [1, 0]) SHAPES.forEach((rows) => {
      PALETTE.forEach((c0) => {
        // underside: a little darker and redder, never muddy
        const c = side ? c0 : [c0[0] * 0.84, c0[1] * 0.66, c0[2] * 0.7];
        const h = rows.length, w = rows[0].length, cv = mk(w, h), x = cv.getContext('2d') as CanvasRenderingContext2D;
        const id = x.createImageData(w, h);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const ch = rows[yy][xx]; if (ch === '.') continue;
          const k = ch === '-' ? 0.82 : 1, o = (yy * w + xx) * 4;
          id.data[o] = Math.min(255, c[0] * k); id.data[o + 1] = Math.min(255, c[1] * k); id.data[o + 2] = Math.min(255, c[2] * k); id.data[o + 3] = 255;
        }
        x.putImageData(id, 0, 0);
        (side === 1 ? sprites : backs).push(cv);
      });
    });
  }

  // ---------- canopy: which tiles carry foliage, and where leaves can come from ----------
  const TILE = 24;
  let tiles: { x: number; y: number; d: number; cov: number; bark: number; ph: number; f: number }[] = [];
  let sources: { x: number; y: number; d: number }[] = [];
  let groundShade = new Uint8Array(0);
  function scanCanopy() {
    const sw = Math.ceil(W / 6), sh = Math.ceil(600 / 6);
    const c = mk(sw, sh), x = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    x.drawImage(imgs.canopy, 0, 0, W, 600, 0, 0, sw, sh);
    let data: Uint8ClampedArray | null = null;
    try { data = x.getImageData(0, 0, sw, sh).data; } catch (e) { data = null; }
    const has = (px: number, py: number) => !data || data[((py | 0) * sw + (px | 0)) * 4 + 3] > 90;
    const dist = (px: number, py: number) => clamp(Math.hypot((px - VP.x) / 900, (py - VP.y) / 620), 0, 1);
    tiles = [];
    for (let ty = 0; ty < 600; ty += TILE) for (let tx = 0; tx < W; tx += TILE) {
      let n = 0, hit = 0, bark = 0;
      for (let sy = ty; sy < ty + TILE; sy += 6) for (let sx = tx; sx < tx + TILE; sx += 6) {
        if (sy >= 600) continue; n++;
        if (!has(sx / 6, sy / 6)) continue;
        hit++;
        // sunlit bark is in the foliage layer too; it has blue in it, leaves don't. Bark must not sway.
        if (data) { const o = (((sy / 6) | 0) * sw + ((sx / 6) | 0)) * 4; if (data[o + 2] > 22 && data[o + 2] > data[o] * 0.15) bark++; }
      }
      if (!hit) continue;
      const cx = tx + TILE / 2, cy = ty + TILE / 2;
      // clusters: neighbouring tiles share a phase and tempo, so foliage moves in soft clumps, not a grid
      tiles.push({ x: tx, y: ty, d: dist(cx, cy), cov: hit / n, bark: hit ? bark / hit : 0, ph: noise(cx / 210, cy / 210) * 12.6, f: 0.75 + noise(cx / 330 + 40, cy / 330) * 0.6 });
    }
    // how solid the foliage is around each tile: lone strips (lit bark, twigs against sky) barely move
    const covAt = new Map<number, number>();
    for (const tl of tiles) covAt.set((tl.y / TILE) * 1000 + tl.x / TILE, tl.cov);
    for (const tl of tiles) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) sum += covAt.get((tl.y / TILE + oy) * 1000 + tl.x / TILE + ox) || 0;
      const c9 = sum / 9, u = clamp((c9 - 0.3) / 0.5, 0, 1);
      tl.cov = (0.12 + 0.88 * u * u * (3 - 2 * u)) * Math.max(0.06, 1 - tl.bark * 3);
    }
    sources = [];
    for (let py = 2; py < sh; py += 2) for (let px = 1; px < sw; px += 2) if (has(px, py)) sources.push({ x: px * 6, y: py * 6, d: dist(px * 6, py * 6) });
    groundShade = new Uint8Array(0);
  }

  // ---------- noise ----------
  const PERM = new Uint8Array(512), GR = new Float32Array(256);
  for (let i = 0; i < 256; i++) { PERM[i] = i; GR[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t; }
  for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i];
  function noise(x: number, y: number) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = GR[PERM[(xi & 255) + PERM[yi & 255]]], b = GR[PERM[((xi + 1) & 255) + PERM[yi & 255]]];
    const c = GR[PERM[(xi & 255) + PERM[(yi + 1) & 255]]], d = GR[PERM[((xi + 1) & 255) + PERM[(yi + 1) & 255]]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // ---------- wind ----------
  let t = 0, windPhase = 0, gustT0 = -99, gustDir = 1, gustPow = 1, nextGust = R(5, 9);
  function gustEnv(tt: number) {
    const a = tt - gustT0;
    if (a < 0) return 0;
    return (1 - Math.exp(-a / 0.9)) * Math.exp(-a / 2.6) * 1.9 * gustPow;
  }
  function windAt(x: number) {
    const base = 0.42 + 0.22 * Math.sin(t * 0.13) + 0.12 * Math.sin(t * 0.37 + 1.1) + 0.06 * Math.sin(t * 0.91 + 2);
    // a gust rolls through the avenue from one side to the other
    const lag = gustDir > 0 ? x / 750 : (W - x) / 750;
    return S.wind * (base + gustEnv(t - lag) * gustDir);
  }

  // ---------- leaves ----------
  // A quiet fall: a handful of leaves at most, sometimes none. Each one lets go of the canopy, eases into
  // its fall, rocks like a real leaf (slowing at the top of each swing), drifts with the breeze and its own
  // little eddies, sometimes spirals, lands, rests a while and fades back into the painted leaves.
  const air: Leaf[] = [], rest: Leaf[] = [];
  let perf = 1;
  let lastSpawn = -99, moodSeed = R(0, 100);
  const smooth = (a: number) => a * a * (3 - 2 * a);
  // how many leaves the moment wants: drifts slowly between a lull (0) and a few (about 6)
  function fallMood() {
    const m = noise(t * 0.03 + moodSeed, 3.7) * 0.75 + noise(t * 0.11 + moodSeed, 9.1) * 0.25;
    return smooth(clamp((m - 0.14) / 0.5, 0, 1));
  }
  const airTarget = () => {
    const g = clamp(gustEnv(t), 0, 1);
    // lulls of 1 or 2, active spells of 4 to 8, a gust can briefly add a few more
    return Math.round((1 + fallMood() * 6.5 + g * 3) * S.density);
  };
  // deeper reds and burnt oranges more often: they read against the gold canopy without any outline
  function pickColour() { return rnd() < 0.6 ? 2 + ((rnd() * 4) | 0) : (rnd() * 2) | 0; }
  function groundFor(k: number) { return 616 + Math.pow(k, 1.6) * 236 + R(-8, 10); }
  function newLeaf(): Leaf | null {
    if (!sources.length) return null;
    // now and then a leaf drifts through close to the viewer, from above the frame: soft, quick, never big
    if (rnd() < 0.1) {
      const k = R(1.02, 1.22), sp = 0.75 + k * 0.7;
      return {
        x: R(80, W - 420), y: -16, vx: 0, vy: 0, k, spr: (4 + ((rnd() * 2) | 0)) * SPR_PER_SHAPE + pickColour(),
        ang: R(-0.6, 0.6), spinBase: R(-0.4, 0.4), tum: R(0, 6.28), tumS: R(1.4, 2.8),
        swing: R(0, 6.28), swingW: R(1.0, 1.6), swingA: R(20, 36) * sp, fall: R(52, 70) * sp, sp,
        drift: R(-4, 8), seed: R(0, 100), spiral: 0, spiralR: 0, nextTwist: R(2, 5),
        groundY: H + 40, state: 0, life: 1.2, restFor: 0, alpha: 0, fade: 0,
      };
    }
    // the upper canopy only, and never from the trees right at the vanishing point
    let s = sources[(rnd() * sources.length) | 0];
    // the breeze mostly blows left to right, so give leaves room to travel before they leave the frame
    for (let i = 0; i < 10 && (s.y > 470 || s.d < 0.16 || s.x > W - 220); i++) s = sources[(rnd() * sources.length) | 0];
    if (s.y > 470 || s.d < 0.16) return null;
    // depth: mostly far and middle distance; a near leaf is rare and still small
    let k = clamp((s.d - 0.16) / 0.84, 0, 1) * 0.8 + R(-0.12, 0.12);
    if (rnd() < 0.12 && s.d > 0.6) k = R(0.85, 1);
    k = clamp(k, 0, 1);
    const shape = k < 0.35 ? (rnd() * 2) | 0 : k < 0.75 ? 1 + ((rnd() * 3) | 0) : 2 + ((rnd() * 3) | 0);
    const sp = 0.75 + k * 0.7; // nearer leaves cross the frame faster
    return {
      x: s.x + R(-5, 5), y: s.y + R(0, 6), vx: 0, vy: 0, k, spr: shape * SPR_PER_SHAPE + pickColour(),
      ang: R(-0.6, 0.6), spinBase: R(-0.5, 0.5), tum: R(0, 6.28), tumS: R(1.2, 2.6),
      swing: R(0, 6.28), swingW: R(1.1, 1.9), swingA: R(14, 30) * sp, fall: R(30, 48) * sp, sp,
      drift: R(-6, 6), seed: R(0, 100), spiral: 0, spiralR: 0, nextTwist: R(2.5, 7),
      groundY: groundFor(k), state: 0, life: 0, restFor: R(5, 12), alpha: 0, fade: 0,
    };
  }
  function seedAir() {
    // begin mid-scene with one or two already falling, not a burst
    const n = Math.min(4, airTarget());
    for (let i = 0; i < n; i++) {
      const l = newLeaf(); if (!l) return;
      l.life = 2 + R(0, 3); l.alpha = 1; l.vy = l.fall;
      l.y += (l.groundY - l.y) * R(0.15, 0.6);
      air.push(l);
    }
  }
  function updateLeaves(dt: number) {
    // trickle: one at a time, a little faster while a gust tears leaves loose
    const gap = gustEnv(t) > 0.5 ? R(0.35, 0.8) : R(0.7, 1.9);
    if (air.length < airTarget() && t - lastSpawn > gap && rnd() < dt * 1.6) {
      const l = newLeaf(); if (l) { air.push(l); lastSpawn = t; }
    }
    for (let i = air.length - 1; i >= 0; i--) {
      const l = air[i];
      l.life += dt;
      // letting go: a moment of hesitation, then the fall eases in
      const detach = smooth(clamp(l.life / 1.6, 0, 1));
      l.alpha = Math.min(1, l.life / 0.9);
      if (l.fade) { l.alpha = Math.max(0, 1 - (l.life - l.fade) / 1.2); if (l.alpha <= 0) { air.splice(i, 1); continue; } }
      // the breeze, plus a slow personal eddy that now and then turns a leaf back on itself
      const eddy = (noise(l.life * 0.35 + l.seed, l.seed) - 0.5) * 2;
      const wantVx = (windAt(l.x) * 17 + l.drift + eddy * 12) * l.sp * detach;
      l.vx += (wantVx - l.vx) * Math.min(1, dt * 0.9);
      // the falling-leaf rock: side to side, slowing and lifting slightly at the top of each swing
      l.swing += l.swingW * dt;
      const sw = Math.sin(l.swing), cw = Math.cos(l.swing);
      const wantVy = l.fall * (0.55 + 0.6 * cw * cw) * detach;
      l.vy += (wantVy - l.vy) * Math.min(1, dt * 1.6);
      let sx = cw * l.swingA * l.swingW * detach;
      // now and then a leaf catches the air and spirals for a couple of turns
      if (!l.spiral && l.life > l.nextTwist) {
        if (rnd() < 0.45) { l.spiral = l.life; l.spiralR = R(8, 16) * l.sp; }
        l.nextTwist = l.life + R(4, 9);
      }
      let tumS = l.tumS, slow = 1;
      if (l.spiral) {
        const a = l.life - l.spiral, dur = 2.6;
        if (a > dur) l.spiral = 0;
        else {
          const env = Math.sin((a / dur) * Math.PI);
          sx += -Math.sin(a * 4.2) * l.spiralR * 4.2 * env;
          slow = 1 - 0.35 * env;
          tumS = l.tumS + 4 * env;
        }
      }
      l.x += (l.vx + sx) * dt;
      l.y += l.vy * slow * dt;
      // tilt follows the swing, with a slow drift of its own; the edge-on turn is continuous, not stepped
      l.ang = sw * 0.55 + l.spinBase * l.life;
      l.tum += tumS * dt;
      if (l.x < -30 || l.x > W + 30) { if (!l.fade) l.fade = l.life; continue; }
      if (l.y > H + 30) { air.splice(i, 1); continue; }
      if (l.y >= l.groundY) {
        air.splice(i, 1);
        l.state = 1; l.y = l.groundY; l.life = 0; l.vx *= 0.3; l.alpha = 1;
        rest.push(l);
      }
    }
    // landed: a short slide to a stop, a rest, then a slow fade back into the painted leaves
    for (let i = rest.length - 1; i >= 0; i--) {
      const l = rest[i];
      l.life += dt;
      l.x += l.vx * dt; l.vx *= Math.pow(0.08, dt);
      l.tum += (Math.round(l.tum / Math.PI) * Math.PI - l.tum) * Math.min(1, dt * 4);
      if (l.life > l.restFor) { l.alpha -= dt / 4; if (l.alpha <= 0) rest.splice(i, 1); }
    }
  }
  // css pixels per sprite pixel, by depth; leaves stay small at any hero size
  let cell = 1;
  function drawLeaf(l: Leaf) {
    const turn = Math.cos(l.tum);
    const spr = (turn < 0 ? backs : sprites)[l.spr];
    const size = (1.15 + l.k * 0.95) * cell / viewScale; // art px per sprite pixel
    const sxk = Math.sign(turn || 1) * Math.max(0.3, Math.abs(turn));
    const flat = l.state === 1 ? 0.6 : 1;
    // distance softens a leaf into the haze a little
    ctx.globalAlpha = l.alpha * (0.74 + 0.26 * Math.min(1, l.k));
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.translate(l.x, l.y);
    ctx.rotate(l.ang);
    ctx.scale(sxk * size, size * flat);
    ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
  }

  // ---------- light ----------
  const FX = 4, fw = Math.ceil(W / FX), fh = Math.ceil(H / FX);
  const dapple = mk(fw, fh), dctx = dapple.getContext('2d') as CanvasRenderingContext2D;
  const dimg = dctx.createImageData(fw, fh);
  const shafts = mk(fw, fh), sctx = shafts.getContext('2d') as CanvasRenderingContext2D;
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
        // only the avenue and its verges: fan out from the vanishing point, fade before the trunks and grass
        const fan = clamp((3.4 - r) / 1.1, 0, 1);
        const o0 = (ey * fw + ex) * 4;
        if (fan <= 0) { d[o0 + 3] = 0; continue; }
        const u = ((x - VP.x) / dy) * 0.8;
        const n = noise(u * 1.1 + windPhase, v * 0.9) * 0.62 + noise(u * 2.6 - windPhase * 1.4 + 9, v * 2.1 + t * 0.05) * 0.38;
        const o = (ey * fw + ex) * 4;
        const lit = clamp((n - 0.56) / 0.14, 0, 1), sh = clamp((0.44 - n) / 0.14, 0, 1);
        if (lit > 0) { d[o] = 255; d[o + 1] = 196; d[o + 2] = 118; d[o + 3] = 70 * lit * sun * fade * fan; }
        else if (sh > 0) { d[o] = 52; d[o + 1] = 24; d[o + 2] = 10; d[o + 3] = 58 * sh * fade * fan * (0.6 + 0.4 * sun); }
        else d[o + 3] = 0;
      }
    }
    dctx.putImageData(dimg, 0, 0);
  }
  function updateShafts() {
    sctx.clearRect(0, 0, fw, fh);
    sctx.globalCompositeOperation = 'lighter';
    for (const s of SHAFTS) {
      const breathe = 0.6 + 0.4 * Math.sin(t * 0.09 + s.ph) + 0.12 * Math.sin(t * 1.3 + s.ph * 2) * (0.5 + gustEnv(t));
      const a = 0.088 * S.sun * clamp(breathe, 0, 1.3);
      if (a < 0.004) continue;
      const sway = Math.sin(t * 0.21 + s.ph) * 14;
      const g = sctx.createLinearGradient(0, 0, 0, 780 / FX);
      g.addColorStop(0, 'rgba(255,214,150,' + a.toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(255,190,110,' + (a * 0.55).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,180,100,0)');
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.moveTo((s.t - s.tw) / FX, 0); sctx.lineTo((s.t + s.tw) / FX, 0);
      sctx.lineTo((s.b + sway + s.bw) / FX, 780 / FX); sctx.lineTo((s.b + sway - s.bw) / FX, 780 / FX);
      sctx.closePath(); sctx.fill();
    }
    sctx.globalCompositeOperation = 'source-over';
  }
  const glints: Glint[] = [];
  function updateGlints() {
    const want = 12 * S.sun * perf * (1 + gustEnv(t));
    if (glints.length < want && sources.length && rnd() < 0.25) {
      const s = sources[(rnd() * sources.length) | 0];
      if (s.d > 0.25) glints.push({ x: s.x, y: s.y, t0: t, life: R(0.5, 1.3) });
    }
    for (let i = glints.length - 1; i >= 0; i--) if (t - glints[i].t0 > glints[i].life) glints.splice(i, 1);
  }

  // ---------- walkers ----------
  const walkers: Walker[] = [
    { id: 'A', Z: 1 / WALKERS.A.d0, X: WALKERS.A.X, dir: 1, v: R(0.0012, 0.0015), ph: 0, born: -99, fadeOut: 0 },
    { id: 'B', Z: 1 / WALKERS.B.d0, X: WALKERS.B.X, dir: 1, v: R(0.0010, 0.0013), ph: 0.5, born: -99, fadeOut: 0 },
  ];
  let nextWalker = R(10, 18);
  function updateWalkers(dt: number) {
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      w.Z += w.dir * w.v * dt;
      const d = 1 / w.Z;
      if ((w.dir > 0 && d < 6.5) || (w.dir < 0 && d > 38)) { w.fadeOut += dt; if (w.fadeOut > 3) walkers.splice(i, 1); }
    }
    if (t > nextWalker && walkers.length < 4) {
      // someone emerges from the haze at the far end, coming this way; or someone sets off away from us
      const toward = rnd() < 0.55;
      const id = rnd() < 0.5 ? 'A' : 'B';
      walkers.push({ id, Z: toward ? 1 / 6.5 : 1 / R(22, 28), X: R(-0.7, 0.7), dir: toward ? -1 : 1, v: R(0.001, 0.0016), ph: R(0, 1), born: t, fadeOut: 0 });
      nextWalker = t + R(12, 22);
    }
  }
  function drawWalker(w: Walker, still: boolean) {
    const P = WALKERS[w.id], d = 1 / w.Z, k = d / P.d0;
    let a = 1;
    if (w.born > -50) a = Math.min(a, clamp((t - w.born) / 3.5, 0, 1));
    a = Math.min(a, 1 - w.fadeOut / 3);
    a *= clamp((d - 5) / 4, 0, 1);
    if (a <= 0) return;
    const fx = VP.x + w.X * d, fy = VP.y + d;
    const step = still ? 0 : (t * 1.9 + w.ph) % 1;            // one stride per ~0.5 s
    const half = step < 0.5;
    const bob = still ? 0 : (Math.abs(Math.sin(step * Math.PI * 2)) > 0.7 ? -1 : 0);
    const split = Math.round(P.h * 0.6);                      // legs below this row
    ctx.save();
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(fx, fy);
    ctx.scale(k, k);
    ctx.drawImage(imgs.walkers, P.ax, 0, P.w, split, -P.cx, -P.feet + bob, P.w, split);
    // the stepping leg leads: mirror the legs every half stride so they alternate
    ctx.save();
    if (!still && half) { ctx.translate(-P.cx + P.w / 2, 0); ctx.scale(-1, 1); ctx.translate(P.cx - P.w / 2, 0); }
    ctx.drawImage(imgs.walkers, P.ax, split, P.w, P.h - split, -P.cx, -P.feet + split + bob * 0.5, P.w, P.h - split);
    ctx.restore();
    ctx.restore();
  }

  // ---------- bird ----------
  let bird: { x: number; y: number; vx: number; t0: number; base: number } | null = null, nextBird = R(9, 18);
  function updateBird(dt: number) {
    if (!bird && t > nextBird) {
      const ltr = rnd() < 0.5;
      bird = { x: ltr ? 780 : 1230, y: R(300, 430), vx: (ltr ? 1 : -1) * R(70, 100), t0: t, base: 0 };
      bird.base = bird.y;
    }
    if (bird) {
      bird.x += bird.vx * dt;
      bird.y = bird.base + Math.sin((t - bird.t0) * 3.2) * 10 - (t - bird.t0) * 6;
      if (bird.x < 760 || bird.x > 1250) { bird = null; nextBird = t + R(16, 32); }
    }
  }
  function drawBird() {
    if (!bird) return;
    const up = Math.sin((t - bird.t0) * 18) > 0;
    const p = 2, x = Math.round(bird.x), y = Math.round(bird.y);
    const edge = clamp(Math.min(bird.x - 760, 1250 - bird.x) / 40, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.85 * edge; ctx.fillStyle = 'rgb(62,34,18)';
    ctx.fillRect(x - p / 2, y, p, p);
    if (up) { ctx.fillRect(x - p * 2, y - p, p * 1.5, p); ctx.fillRect(x + p, y - p, p * 1.5, p); }
    else { ctx.fillRect(x - p * 2.5, y + p * 0.5, p * 2, p * 0.7); ctx.fillRect(x + p * 0.5, y + p * 0.5, p * 2, p * 0.7); }
    ctx.restore();
  }

  // ---------- squirrel ----------
  // An Eastern gray squirrel lives under the near-left bench. Every half minute or so it scurries out onto
  // the path, sits up, nibbles an acorn, looks around, flicks its tail, and darts back.
  const SQ_PAL: Record<string, string> = {
    // gray fur, warmed by the afternoon light so it belongs in the painting
    T: 'rgb(126,108,94)', t: 'rgb(162,138,114)', B: 'rgb(110,94,84)', R: 'rgb(144,100,70)', D: 'rgb(62,50,44)',
    L: 'rgb(196,166,130)', E: 'rgb(20,16,16)', A: 'rgb(132,80,34)', a: 'rgb(84,56,30)',
  };
  const SQ_FRAMES: Record<string, string[]> = {
    sit: ['.tt........', 'tTTt.......', 'tTDTt......', 'tT.DT...BB.', '.t..TT.BBEB', '..t.TRBBBBD', '...tTRBBLL.', '....TRBBLL.', '....RBBBBL.', '.....DD.DD.'],
    eat: ['.tt........', 'tTTt.......', 'tTDTt......', 'tT.DT...BB.', '.t..TT.BBEB', '..t.TRBBBBa', '...tTRBBLLA', '....TRBBLL.', '....RBBBBL.', '.....DD.DD.'],
    look: ['.tt........', 'tTTt.......', 'tTDTt......', 'tT.DT..BB..', '.t..TTBEBB.', '..t.TRBBBB.', '...tTRBBLL.', '....TRBBLL.', '....RBBBBL.', '.....DD.DD.'],
    flick: ['..tt.......', '.tTTt......', '.tDTt......', 'tTD.T...BB.', '.t..TT.BBEB', '..t.TRBBBBD', '...tTRBBLL.', '....TRBBLL.', '....RBBBBL.', '.....DD.DD.'],
    run1: ['tt...........', 'tTTt......BB.', '.tTTTRRBBBEB.', '...TRBBBBBBBD', '....BLLLLBB..', '...D.......D.'],
    run2: ['.tt..........', 'tTTt......BB.', '..tTTRRBBBEB.', '...TRBBBBBBBD', '...DBLLLLB...', '........DD...'],
  };
  const SQ_PX = 3; // art px per squirrel pixel, matching the painting's own pixel size
  const sqSpr: Record<string, HTMLCanvasElement> = {};
  function buildSquirrel() {
    for (const k in SQ_FRAMES) {
      const rows = SQ_FRAMES[k], h = rows.length, w = rows[0].length, cv = mk(w, h), x = cv.getContext('2d') as CanvasRenderingContext2D;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const ch = rows[yy][xx]; if (ch !== '.') { x.fillStyle = SQ_PAL[ch]; x.fillRect(xx, yy, 1, 1); } }
      sqSpr[k] = cv;
    }
  }
  const SQ_HOME = { x: 468, y: 794 };
  type Seg = { x: number; y: number; run: boolean; dur: number };
  const sq = { mode: 'away' as 'away' | 'move' | 'sit', until: R(5, 8), x: SQ_HOME.x, y: SQ_HOME.y, dir: 1, segs: [] as Seg[], s0: 0,
    fx: 0, fy: 0, frame: 'sit', act: '', actEnd: 0, nextAct: 0, sitEnd: 0, leaving: false, a: 0, hop: 0 };
  function sqPlan(tx: number, ty: number) {
    // scurry in two bursts with a wary pause between, like the real thing
    const mx = sq.x + (tx - sq.x) * R(0.45, 0.6), my = sq.y + (ty - sq.y) * 0.5;
    const d1 = Math.hypot(mx - sq.x, my - sq.y), d2 = Math.hypot(tx - mx, ty - my);
    sq.segs = [{ x: mx, y: my, run: true, dur: d1 / 170 }, { x: mx, y: my, run: false, dur: R(0.4, 0.9) }, { x: tx, y: ty, run: true, dur: d2 / 170 }];
    sq.fx = sq.x; sq.fy = sq.y; sq.s0 = t; sq.mode = 'move';
  }
  function updateSquirrel() {
    if (sq.mode === 'away') {
      sq.a = 0;
      if (t > sq.until) { sq.x = SQ_HOME.x; sq.y = SQ_HOME.y; sq.leaving = false; sqPlan(R(585, 640), R(812, 824)); }
      return;
    }
    if (sq.mode === 'move') {
      const seg = sq.segs[0];
      const u = clamp((t - sq.s0) / seg.dur, 0, 1);
      sq.dir = seg.x >= sq.fx ? 1 : -1;
      if (seg.run) {
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        sq.x = sq.fx + (seg.x - sq.fx) * e; sq.y = sq.fy + (seg.y - sq.fy) * e;
        const ph = (t * 7.5) % 1;
        sq.frame = ph < 0.5 ? 'run1' : 'run2';
        sq.hop = -Math.abs(Math.sin(ph * Math.PI * 2)) * 2.5;
      } else { sq.frame = 'look'; sq.hop = 0; sq.dir = sq.leaving ? -1 : 1; }
      // fades in and out only while it's in the bench's shadow
      const dh = Math.hypot(sq.x - SQ_HOME.x, sq.y - SQ_HOME.y);
      sq.a = clamp(dh / 28, 0, 1);
      if (u >= 1) {
        sq.fx = seg.x; sq.fy = seg.y; sq.segs.shift(); sq.s0 = t;
        if (!sq.segs.length) {
          if (sq.leaving) { sq.mode = 'away'; sq.until = t + R(22, 40); }
          else { sq.mode = 'sit'; sq.dir = rnd() < 0.7 ? 1 : -1; sq.sitEnd = t + R(7, 12); sq.nextAct = t + R(0.6, 1.4); sq.act = ''; sq.hop = 0; }
        }
      }
      return;
    }
    // sitting: small, unhurried business
    sq.a = 1; sq.hop = 0;
    if (sq.act && t > sq.actEnd) { sq.act = ''; sq.nextAct = t + R(0.7, 2); }
    if (!sq.act && t > sq.nextAct) {
      const r = rnd();
      sq.act = r < 0.45 ? 'eat' : r < 0.7 ? 'look' : r < 0.88 ? 'flick' : 'turn';
      sq.actEnd = t + (sq.act === 'eat' ? R(1.8, 3.4) : sq.act === 'look' ? R(0.9, 1.8) : sq.act === 'flick' ? 0.32 : 0.05);
      if (sq.act === 'turn') sq.dir = -sq.dir;
    }
    if (sq.act === 'eat') { sq.frame = 'eat'; sq.hop = Math.sin(t * 38) > 0.3 ? -0.8 : 0; }
    else if (sq.act === 'look') sq.frame = 'look';
    else if (sq.act === 'flick') sq.frame = (t * 12) % 1 < 0.5 ? 'flick' : 'sit';
    else sq.frame = 'sit';
    if (t > sq.sitEnd && !sq.act) { sq.leaving = true; sqPlan(SQ_HOME.x, SQ_HOME.y); }
  }
  function drawSquirrel() {
    if (sq.mode === 'away' || sq.a <= 0) return;
    const spr = sqSpr[sq.frame], w = spr.width * SQ_PX, h = spr.height * SQ_PX;
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    ctx.globalAlpha = sq.a * 0.3;
    ctx.fillStyle = 'rgb(40,20,10)';
    ctx.beginPath(); ctx.ellipse(sq.x, sq.y, w * 0.38, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = sq.a;
    ctx.translate(Math.round(sq.x), Math.round(sq.y + sq.hop));
    if (sq.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(spr, -w * 0.55, -h, w, h);
    ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalAlpha = 1;
  }

  // ---------- frame ----------
  function drawCanopy(still: boolean) {
    if (!canS) return;
    const cs = canS.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (still) { ctx.drawImage(canS, 0, 0); ctx.setTransform(rs, 0, 0, rs, 0, 0); return; }
    for (let i = 0; i < tiles.length; i++) {
      const tl = tiles[i];
      const cx = tl.x + TILE / 2, cy = tl.y + TILE / 2;
      // outer, nearer foliage moves most; the trees at the vanishing point barely stir.
      // Edge tiles (against sky or trunk) move less, so silhouettes stay clean.
      const amp = (0.5 + 4.6 * Math.pow(tl.d, 1.3)) * tl.cov;
      const w = windAt(cx);
      const sway = Math.sin(t * tl.f + tl.ph) * 0.55 + Math.sin(t * tl.f * 2.1 + tl.ph * 1.7) * 0.22
        + (noise(cx / 260 + t * 0.35, cy / 260) - 0.5) * 0.7 + (w - 0.45 * S.wind) * 0.9;
      const dx = amp * sway, dy = amp * (0.3 * Math.sin(t * tl.f * 1.5 + tl.ph * 0.8) - 0.12 * Math.abs(sway));
      ctx.drawImage(canS, tl.x * cs, tl.y * cs, TILE * cs, TILE * cs, (tl.x + dx) * cs, (tl.y + dy) * cs, TILE * cs, TILE * cs);
    }
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
  }
  function render(dt: number, still: boolean) {
    if (!baseS) prescale();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(baseS as HTMLCanvasElement, 0, 0);
    ctx.setTransform(rs, 0, 0, rs, 0, 0);
    if (still) {
      // the painting as painted: walkers back where the artist put them
      ctx.drawImage(imgs.walkers, WALKERS.A.ax, 0, WALKERS.A.w, WALKERS.A.h, 984, 593, WALKERS.A.w, WALKERS.A.h);
      ctx.drawImage(imgs.walkers, WALKERS.B.ax, 0, WALKERS.B.w, WALKERS.B.h, 1008, 595, WALKERS.B.w, WALKERS.B.h);
      return;
    }
    drawCanopy(false);
    // dappled sun and shade on the ground
    if (t - lastDapple > 1 / (perf > 0.7 ? 24 : 12)) { updateDapple(); lastDapple = t; }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dapple, 0, 0, fw, fh, 0, 0, fw * FX, fh * FX);
    // warm haze breathing at the far end of the avenue
    const hz = ctx.createRadialGradient(VP.x, VP.y - 30, 0, VP.x, VP.y - 30, 230);
    const ha = (0.06 + 0.035 * Math.sin(t * 0.07)) * S.sun;
    hz.addColorStop(0, 'rgba(255,210,150,' + ha.toFixed(3) + ')'); hz.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hz; ctx.fillRect(VP.x - 230, VP.y - 260, 460, 460);
    // lamps glowing softly in the afternoon
    for (let i = 0; i < LAMPS.length; i++) {
      const L = LAMPS[i], a = 0.07 + 0.03 * Math.sin(t * 0.5 + i * 1.9);
      const g = ctx.createRadialGradient(L[0], L[1], 0, L[0], L[1], L[2] * 1.6);
      g.addColorStop(0, 'rgba(255,230,170,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = g; ctx.fillRect(L[0] - L[2] * 1.6, L[1] - L[2] * 1.6, L[2] * 3.2, L[2] * 3.2);
    }
    // shafts of sun through the gap in the canopy
    if (t - lastShaft > 1 / 15) { updateShafts(); lastShaft = t; }
    ctx.drawImage(shafts, 0, 0, fw, fh, 0, 0, fw * FX, fh * FX);
    // sun catching leaves for a moment
    for (const gl of glints) {
      const a = Math.sin(((t - gl.t0) / gl.life) * Math.PI) * 0.4 * Math.min(1, S.sun);
      ctx.fillStyle = 'rgba(255,238,190,' + a.toFixed(3) + ')';
      ctx.fillRect(Math.round(gl.x / 3) * 3, Math.round(gl.y / 3) * 3, 3, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    // leaves are filtered like the painting itself is when it's scaled down, so they sit in it, not on it
    ctx.imageSmoothingEnabled = true;
    for (const l of rest) drawLeaf(l);
    for (const l of air) if (l.k < 0.45) drawLeaf(l);
    ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalAlpha = 1;
    for (const w of walkers) drawWalker(w, !S.walkers);
    ctx.imageSmoothingEnabled = false;
    drawSquirrel();
    drawBird();
    ctx.imageSmoothingEnabled = true;
    for (const l of air) if (l.k >= 0.45) drawLeaf(l);
    ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalAlpha = 1;
  }
  function renderStill() { if (ready) render(0, true); }

  // ---------- loop ----------
  let last = 0, frames = 0, msAcc = 0;
  function frame(now: number) {
    raf = 0;
    if (dead) return;
    const raw = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    // adapt density to the device: back off when frames run long, recover when there is headroom
    frames++; msAcc += raw * 1000;
    if (frames >= 90) {
      const avg = msAcc / frames;
      if (avg > 24 && perf > 0.4) perf = Math.max(0.4, perf * 0.82);
      else if (avg < 15 && perf < 1) perf = Math.min(1, perf * 1.08);
      frames = 0; msAcc = 0;
    }
    const dt = raw * S.speed;
    t += dt;
    windPhase += dt * (0.08 + 0.16 * Math.abs(windAt(VP.x)));
    if (t > nextGust) { gustT0 = t; gustDir = rnd() < 0.72 ? 1 : -1; gustPow = R(0.7, 1.25); nextGust = t + R(8, 17) / Math.max(0.35, S.wind); }
    updateLeaves(dt);
    if (S.walkers) updateWalkers(dt);
    updateGlints();
    updateBird(dt);
    updateSquirrel();
    render(dt, false);
    schedule();
  }
  function running() { return ready && !dead && active && visible && onScreen && S.animate && !(reduceMQ && reduceMQ.matches); }
  function schedule() { if (!raf && running()) raf = requestAnimationFrame(frame); }
  function sync() {
    if (!ready) return;
    if (running()) { last = 0; schedule(); }
    else { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (!S.animate || (reduceMQ && reduceMQ.matches)) renderStill(); }
  }
  function init() {
    if (dead) return;
    buildSprites();
    buildSquirrel();
    scanCanopy();
    seedAir();
    ready = true;
    resize();
    renderStill();
    canvas.style.opacity = '1';
    sync();
  }
  const onVis = () => { visible = !document.hidden; sync(); };
  document.addEventListener('visibilitychange', onVis);
  reduceMQ?.addEventListener?.('change', sync);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    const box = es[0].boundingClientRect;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const laidOut = box.width > 1 && box.height > 1 && box.bottom > 0 && box.top < vh;
    onScreen = es[0].isIntersecting || laidOut;
    sync();
  }) : null;
  io?.observe(wrap);
  window.addEventListener('pageshow', () => {
    visible = !document.hidden;
    onScreen = true;
    sync();
  });
  void groundShade;

  return {
    setActive(on: boolean) { active = !!on; sync(); },
    set(next: Partial<ParkSettings>) {
      const prevDensity = S.density;
      Object.assign(S, next);
      if (next.density !== undefined && next.density < prevDensity) {
        for (let i = air.length - 1; i >= airTarget(); i--) if (!air[i].fade) air[i].fade = air[i].life;
      }
      sync();
    },
    destroy() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      reduceMQ?.removeEventListener?.('change', sync);
      io?.disconnect(); ro?.disconnect();
    },
  };
}
