// ls2/living-sign/nightScene.ts
function makeNight(wrap, canvas, urls) {
  var W = 478, H = 494;
  var TAXI = { x: 209, y: 303, w: 129, h: 97 }, GLOW = { x: 207, y: 301, w: 143, h: 177 };
  var A0 = [272, 398], VP = [198, 337];
  var TAIL = [[250, 356], [326, 356]];
  var SIG = [{ x: 171, y: 243, w: 24, h: 28, go: [183, 265], ax: 0 }, { x: 214, y: 267, w: 24, h: 28, go: [226, 289], ax: 24 }];
  var WINS = [[62, 119, 18, 50], [403, 54, 12, 46], [404, 134, 12, 48], [433, 118, 10, 48], [120, 108, 12, 10], [120, 130, 12, 10], [120, 152, 12, 10]];
  var ROAD_Y = 392;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var rnd = Math.random, R = function(a, b) {
    return a + rnd() * (b - a);
  };
  var clamp = function(v, a, b) {
    return v < a ? a : v > b ? b : v;
  };
  var dead = false, raf = 0, visible = true, onScreen = true, active = true;
  var imgs = {}, pending = 5;
  ["bg", "cars", "glow", "signals", "masks"].forEach(function(k) {
    var im = new Image();
    im.onload = function() {
      if (--pending === 0) ready();
    };
    im.src = urls[k];
    imgs[k] = im;
  });
  function mk(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  var scene = mk(W, H), sctx = scene.getContext("2d", { willReadFrequently: true });
  var srcData = null, outData, src32, out32, treeIdx, treeW, lum = null, roadPts = [], leafPts = [];
  var winOff = [];
  function ready() {
    if (dead) return;
    sctx.drawImage(imgs.bg, 0, 0);
    try {
      srcData = sctx.getImageData(0, 0, W, H);
      outData = sctx.getImageData(0, 0, W, H);
      src32 = new Uint32Array(srcData.data.buffer);
      out32 = new Uint32Array(outData.data.buffer);
      var mc = mk(W, H), mctx = mc.getContext("2d", { willReadFrequently: true });
      mctx.drawImage(imgs.masks, 0, 0);
      var m = mctx.getImageData(0, 0, W, H).data, idx = [], wts = [];
      lum = new Uint8Array(W * H);
      for (var i = 0; i < W * H; i++) {
        var c = src32[i], r = c & 255, g = c >>> 8 & 255, b = c >>> 16 & 255;
        lum[i] = r * 0.3 + g * 0.59 + b * 0.11 | 0;
        if (m[i * 4] > 127) {
          idx.push(i);
          wts.push(0.6 + 0.4 * rnd());
          if (r > 150 && g > 100 && b < 90 && rnd() < 0.08) leafPts.push(i);
        }
        if (m[i * 4 + 1] > 127 && lum[i] > 70 && i % W > 20 && i % W < W - 20) roadPts.push(i);
      }
      treeIdx = new Int32Array(idx);
      treeW = new Float32Array(wts);
      WINS.forEach(function(wv) {
        var x = wv[0], y = wv[1], w = wv[2], h = wv[3];
        var oc = mk(w, h), oc2 = oc.getContext("2d"), id = oc2.createImageData(w, h);
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
          var p = src32[(y + yy) * W + x + xx], rr = p & 255, gg = p >>> 8 & 255, bb = p >>> 16 & 255, o = (yy * w + xx) * 4;
          if (rr > 120 && rr > bb + 50) {
            id.data[o] = rr * 0.22 + 10;
            id.data[o + 1] = gg * 0.2 + 9;
            id.data[o + 2] = bb * 0.25 + 16;
            id.data[o + 3] = 255;
          }
        }
        oc2.putImageData(id, 0, 0);
        winOff.push({ x, y, c: oc, a: 0, target: 0 });
      });
    } catch (err) {
      srcData = null;
    }
    canvas.style.opacity = "1";
    start();
  }
  var lastTree = -1;
  function updateTrees(t2) {
    if (!srcData || t2 - lastTree < 0.05) return;
    lastTree = t2;
    out32.set(src32);
    var gust = 0.6 * Math.sin(t2 * 0.37) + 0.4 * Math.sin(t2 * 0.61 + 1.7);
    for (var k = 0; k < treeIdx.length; k++) {
      var i = treeIdx[k], x = i % W, y = i / W | 0;
      var f = treeW[k];
      var dx = f * (gust * 0.9 + 0.7 * Math.sin(t2 * 1.9 + x * 0.09 + y * 0.05)), dy = f * 0.35 * Math.sin(t2 * 1.4 + x * 0.07);
      var sx = x - dx + 0.5 | 0, sy = y - dy + 0.5 | 0;
      if (sx === x && sy === y) continue;
      if (sx >= 0 && sy >= 0 && sx < W && sy < H) out32[i] = src32[sy * W + sx];
    }
    sctx.putImageData(outData, 0, 0);
  }
  var sig = { s: "red", until: R(3.5, 5), greenAt: 0 };
  function updateSignal(t2) {
    if (t2 < sig.until) return;
    if (sig.s === "red") {
      sig.s = "green";
      sig.until = t2 + R(13, 17);
      sig.greenAt = t2;
    } else if (sig.s === "green") {
      sig.s = "amber";
      sig.until = t2 + 2.6;
    } else {
      sig.s = "red";
      sig.until = t2 + R(8, 11);
    }
  }
  function glowDot(x, y, r, rgb, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawSignals() {
    if (sig.s === "red") return;
    for (var k = 0; k < SIG.length; k++) {
      var s = SIG[k];
      ctx.drawImage(imgs.signals, s.ax, 0, s.w, s.h, s.x, s.y, s.w, s.h);
      var col = sig.s === "green" ? "120,255,190" : "255,190,60";
      glowDot(s.go[0], s.go[1], 6, col, 0.85);
      ctx.fillStyle = "rgba(" + col + ",0.95)";
      ctx.fillRect(s.go[0] - 1, s.go[1] - 1, 3, 2);
    }
  }
  var STOP = 2, GAP = 1, ENTER = 0.8, FAR = 13;
  var KINDS = [0, 0, 1, 2, 3, 4, 5], GLOWK = [1, 0.75, 0.85, 0.85, 0.85, 0.75];
  var cars0 = [
    { z: STOP, v: 0, kind: 1 + (rnd() * 5 | 0), vmax: R(0.85, 1.15), born: -9, brake: 1, passed: false, ph: R(0, 6) },
    { z: 1, v: 0, kind: 0, vmax: R(0.85, 1.15), born: -9, brake: 1, passed: false, ph: R(0, 6) }
  ];
  var lane = cars0.slice(), nextSpawn = R(5, 7);
  function updateLane(t2, dt) {
    var green = sig.s === "green";
    lane.sort(function(p, q) {
      return q.z - p.z;
    });
    for (var k = 0; k < lane.length; k++) {
      var c = lane[k], lead = k > 0 ? lane[k - 1] : null;
      var limit = lead ? lead.z - GAP : Infinity;
      if (!c.passed) {
        if (green || sig.s === "amber" && c.z > STOP - 0.12 && c.v > 0.5) {
          if (c.z >= STOP - 0.02) c.passed = true;
        } else limit = Math.min(limit, STOP);
        if (green && c.z >= STOP - 0.02) c.passed = true;
      }
      var waiting = green && !c.passed && c.v < 0.05 && t2 - sig.greenAt < 0.8 + k * 0.45;
      var room = Math.max(0, limit - c.z);
      var vt = waiting ? 0 : Math.min(c.vmax, Math.sqrt(2 * 0.9 * room));
      var prev = c.v;
      c.v = vt > c.v ? Math.min(vt, c.v + dt * (c.v < 0.3 ? 0.35 : 0.55)) : Math.max(vt, c.v - dt * 1.6);
      c.z += c.v * dt;
      var target = c.v < 0.02 || c.v < prev - 2e-3 ? 1 : clamp(0.95 - c.v * 0.25, 0.55, 0.95);
      c.brake += (target - c.brake) * Math.min(1, dt * 6);
    }
    for (k = lane.length - 1; k >= 0; k--) if (lane[k].z > FAR) lane.splice(k, 1);
    if (t2 > nextSpawn) {
      var back = lane.length ? lane[lane.length - 1] : null;
      var queued = 0;
      for (k = 0; k < lane.length; k++) if (!lane[k].passed) queued++;
      if ((!back || back.z > ENTER + GAP + 0.05) && (green || queued < 2)) {
        lane.push({ z: ENTER, v: green ? 0.8 : 0.6, kind: KINDS[rnd() * KINDS.length | 0], vmax: R(0.85, 1.15), born: t2, brake: 0.7, passed: false, ph: R(0, 6) });
        nextSpawn = t2 + (green ? R(2, 3.6) : R(2.5, 4.5));
      } else nextSpawn = t2 + 0.5;
    }
  }
  function drawLane(t2) {
    for (var k = lane.length - 1; k >= 0; k--) drawCar(lane[k], t2);
  }
  function drawCar(c, t2) {
    var s = 1 / c.z;
    var a = clamp((t2 - c.born) / 0.9, 0, 1) * clamp((FAR - c.z) / 4, 0, 1);
    if (a <= 0) return;
    var bob = c.v > 0.05 ? Math.sin(t2 * 10.5 + c.ph) * 0.35 * s : 0;
    var ax = VP[0] + (A0[0] - VP[0]) * s, ay = VP[1] + (A0[1] - VP[1]) * s + bob;
    var brake = c.brake, gk = GLOWK[c.kind];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a * gk * (0.55 + 0.45 * brake);
    var gx = ax - (A0[0] - GLOW.x) * s, gy = ay - (A0[1] - GLOW.y) * s, gw = GLOW.w * s;
    var rows = Math.round(GLOW.h / 2);
    for (var r = 0; r < rows; r++) {
      var sy = r * 2, below = sy > A0[1] - GLOW.y - 4;
      var off = below ? Math.sin(t2 * 2.4 + r * 0.8) * 1.2 * s : 0;
      ctx.drawImage(imgs.glow, 0, sy, GLOW.w, 2, gx + off, gy + sy * s, gw, 2 * s + 0.5);
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = s < 0.98;
    ctx.drawImage(imgs.cars, c.kind * TAXI.w, 0, TAXI.w, TAXI.h, ax - (A0[0] - TAXI.x) * s, ay - (A0[1] - TAXI.y) * s, TAXI.w * s, TAXI.h * s);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var k = 0; k < 2; k++) {
      var lx = ax + (TAIL[k][0] - A0[0]) * s, ly = ay + (TAIL[k][1] - A0[1]) * s;
      glowDot(lx, ly, Math.max(1.6, 7 * s) * (0.8 + 0.3 * brake), "255,40,25", a * (0.25 + 0.35 * brake));
      if (s < 0.7) {
        ctx.fillStyle = "rgba(255,70,50," + a + ")";
        ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
      }
      var len = 6 + 34 * s, sx0 = Math.round(lx);
      for (var q = 0; q < len; q += 2) {
        var o = Math.round(Math.sin(t2 * 3 + q * 0.5 + k) * 0.8);
        ctx.fillStyle = "rgba(255,60,30," + a * 0.16 * (1 - q / len) * (0.6 + brake * 0.4) + ")";
        ctx.fillRect(sx0 + o - (s > 0.5 ? 1 : 0), Math.round(ay + 2 * s + q), s > 0.5 ? 3 : 1, 2);
      }
    }
    ctx.restore();
  }
  var cars = [], nextCar = R(1.5, 4);
  function updateCars(t2, dt) {
    if (t2 > nextCar) {
      if (sig.s === "red") {
        var dir = rnd() < 0.5 ? 1 : -1;
        cars.push({ kind: "cross", x: dir > 0 ? 140 : 262, y: 339 + (dir > 0 ? 1 : -1), dir, v: R(16, 26), life: 0 });
        nextCar = t2 + R(2.5, 7);
      } else {
        cars.push({ kind: "far", z: R(5, 7), v: R(0.9, 1.4), lane: rnd() < 0.5 ? -9 : 7, life: 0, oncoming: rnd() < 0.4 });
        nextCar = t2 + R(6, 12);
      }
    }
    for (var k = cars.length - 1; k >= 0; k--) {
      var c = cars[k];
      c.life += dt;
      if (c.kind === "cross") {
        c.x += c.dir * c.v * dt;
        if (c.x < 130 || c.x > 272) cars.splice(k, 1);
      } else {
        c.z += (c.oncoming ? -0.35 : 1) * c.v * dt;
        if (c.z > 22 || c.z < 3.2 || c.life > 14) cars.splice(k, 1);
      }
    }
  }
  function drawCars() {
    ctx.save();
    for (var k = 0; k < cars.length; k++) {
      var c = cars[k], fade;
      if (c.kind === "cross") {
        fade = clamp(Math.min(c.x - 130, 272 - c.x) / 18, 0, 1);
        var x = Math.round(c.x), y = c.y;
        ctx.globalAlpha = fade;
        ctx.fillStyle = "rgb(22,22,30)";
        ctx.fillRect(x - 3, y - 1, 6, 2);
        ctx.globalCompositeOperation = "lighter";
        glowDot(x + 3 * c.dir, y, 3, "255,230,170", 0.5 * fade);
        ctx.fillStyle = "rgba(255,240,200," + fade + ")";
        ctx.fillRect(x + 3 * c.dir, y, 1, 1);
        ctx.fillStyle = "rgba(255,50,30," + 0.8 * fade + ")";
        ctx.fillRect(x - 3 * c.dir - (c.dir > 0 ? 1 : 0), y, 1, 1);
        ctx.fillStyle = "rgba(255,220,150," + 0.12 * fade + ")";
        ctx.fillRect(x + 3 * c.dir, y + 2, 1, 5);
        ctx.globalCompositeOperation = "source-over";
      } else {
        var s = 1 / c.z;
        fade = clamp(c.life / 1.2, 0, 1) * clamp((22 - c.z) / 6, 0, 1) * clamp((c.z - 3.2) / 0.8, 0, 1);
        var cx = VP[0] + (A0[0] - VP[0] + c.lane * 3) * s, cy = VP[1] + (A0[1] - VP[1]) * s;
        var spread = Math.max(1, 70 * s), col = c.oncoming ? "255,236,190" : "255,45,30";
        ctx.globalCompositeOperation = "lighter";
        for (var q = -1; q <= 1; q += 2) {
          var lx = cx + q * spread / 2;
          glowDot(lx, cy, Math.max(1.4, 12 * s), col, 0.45 * fade);
          ctx.fillStyle = "rgba(" + col + "," + fade + ")";
          ctx.fillRect(Math.round(lx), Math.round(cy), 1, 1);
          ctx.fillStyle = "rgba(" + col + "," + 0.12 * fade + ")";
          ctx.fillRect(Math.round(lx), Math.round(cy) + 2, 1, Math.round(4 + 30 * s));
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  var drops = [], ripples = [], leaves = [], nextLeaf = R(14, 26), nextRipple = 0;
  for (var d0 = 0; d0 < 38; d0++) drops.push({ x: R(0, W), y: R(-H, H), v: R(150, 210), len: R(3, 6) | 0 });
  function updateWeather(t2, dt) {
    for (var k = 0; k < drops.length; k++) {
      var d = drops[k];
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.12;
      if (d.y > H) {
        d.y = R(-40, 0);
        d.x = R(0, W + 30);
      }
    }
    if (roadPts.length && t2 > nextRipple) {
      var i = roadPts[rnd() * roadPts.length | 0];
      ripples.push({ x: i % W, y: i / W | 0, t0: t2 });
      nextRipple = t2 + R(0.12, 0.45);
    }
    for (k = ripples.length - 1; k >= 0; k--) if (t2 - ripples[k].t0 > 0.5) ripples.splice(k, 1);
    if (leafPts.length && t2 > nextLeaf) {
      var p = leafPts[rnd() * leafPts.length | 0], c = src32[p];
      leaves.push({ x: p % W, y: p / W | 0, t0: t2, vy: R(9, 13), ph: R(0, 6), col: "rgb(" + (c & 255) + "," + (c >>> 8 & 255) + "," + (c >>> 16 & 255) + ")" });
      nextLeaf = t2 + R(18, 35);
    }
    for (k = leaves.length - 1; k >= 0; k--) {
      var L = leaves[k], age = t2 - L.t0;
      L.y += L.vy * dt;
      L.x += Math.cos(age * 1.4 + L.ph) * 7 * dt - 1.5 * dt;
      if (age > 12 || L.y > H - 30) leaves.splice(k, 1);
    }
  }
  function drawWeather(t2) {
    ctx.save();
    for (var k = 0; k < drops.length; k++) {
      var d = drops[k], x = Math.round(d.x), y = Math.round(d.y);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      var l = lum ? lum[y * W + x] : 40;
      ctx.fillStyle = "rgba(205,218,240," + (0.05 + 0.5 * Math.pow(l / 255, 1.2)).toFixed(3) + ")";
      ctx.fillRect(x, y, 1, d.len);
    }
    ctx.globalCompositeOperation = "lighter";
    for (k = 0; k < ripples.length; k++) {
      var rp = ripples[k], age = (t2 - rp.t0) / 0.5, w = 1 + Math.round(age * 4);
      ctx.fillStyle = "rgba(255,215,160," + (0.22 * (1 - age)).toFixed(3) + ")";
      ctx.fillRect(rp.x - (w >> 1), rp.y, w, 1);
    }
    ctx.globalCompositeOperation = "source-over";
    for (k = 0; k < leaves.length; k++) {
      var L = leaves[k], age2 = t2 - L.t0, wd = Math.round(1 + Math.abs(Math.cos(age2 * 3 + L.ph)) * 2);
      ctx.globalAlpha = clamp(Math.min(age2 / 0.5, (12 - age2) / 3), 0, 1);
      ctx.fillStyle = L.col;
      ctx.fillRect(Math.round(L.x), Math.round(L.y), wd, 2);
    }
    ctx.restore();
  }
  var nextWin = R(20, 40);
  function updateWindows(t2, dt) {
    if (winOff.length && t2 > nextWin) {
      var w = winOff[rnd() * winOff.length | 0];
      w.target = w.target ? 0 : 1;
      nextWin = t2 + R(18, 45);
    }
    for (var k = 0; k < winOff.length; k++) {
      var o = winOff[k];
      o.a += (o.target - o.a) * Math.min(1, dt * 2.5);
    }
  }
  function drawWindows() {
    for (var k = 0; k < winOff.length; k++) {
      var o = winOff[k];
      if (o.a > 0.01) {
        ctx.globalAlpha = o.a;
        ctx.drawImage(o.c, o.x, o.y);
      }
    }
    ctx.globalAlpha = 1;
  }
  var t = 0, last = 0;
  function drawBase(time, ripple) {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    var srcC = srcData ? scene : imgs.bg;
    ctx.drawImage(srcC, 0, 0);
    if (ripple) {
      for (var y = ROAD_Y; y < H; y += 2) {
        var depth = (y - ROAD_Y) / (H - ROAD_Y);
        var off = Math.round((0.35 + depth * 0.75) * Math.sin(time * 1.5 + y * 0.3 + Math.sin(time * 0.5 + y * 0.11) * 2));
        if (off) ctx.drawImage(srcC, 0, y, W, 2, off, y, W, 2);
      }
    }
  }
  function vignette() {
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(imgs.bg, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  function frame(now) {
    raf = 0;
    if (dead) return;
    var dt = last ? Math.min(0.05, (now - last) / 1e3) : 0.016;
    last = now;
    t += dt;
    updateSignal(t);
    updateLane(t, dt);
    updateCars(t, dt);
    updateWeather(t, dt);
    updateWindows(t, dt);
    updateTrees(t);
    drawBase(t, true);
    drawWindows();
    drawSignals();
    drawCars();
    drawLane(t);
    drawWeather(t);
    vignette();
    schedule();
  }
  function schedule() {
    if (!raf && !dead && active && visible && onScreen && !reduce.matches) raf = requestAnimationFrame(frame);
  }
  function drawStill() {
    if (srcData) {
      out32.set(src32);
      sctx.putImageData(outData, 0, 0);
    }
    sig.s = "red";
    cars = [];
    ripples = [];
    leaves = [];
    drawBase(0, false);
    drawCar({ z: 1, v: 0, kind: 0, vmax: 0, born: -9, brake: 1, passed: false, ph: 0 }, 0);
    vignette();
  }
  function start() {
    if (reduce.matches) {
      drawStill();
      return;
    }
    last = 0;
    schedule();
  }
  function onMotionPref() {
    if (pending) return;
    if (reduce.matches) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      drawStill();
    } else {
      last = 0;
      schedule();
    }
  }
  if (reduce.addEventListener) reduce.addEventListener("change", onMotionPref);
  function onVis() {
    visible = !document.hidden;
    last = 0;
    if (visible) schedule();
  }
  document.addEventListener("visibilitychange", onVis);
  var io = null;
  if (window.IntersectionObserver) {
    io = new IntersectionObserver(function(es) {
      onScreen = es[0].isIntersecting;
      last = 0;
      if (onScreen) schedule();
    });
    io.observe(wrap);
  }
  return {
    setActive: function(on) {
      active = !!on;
      last = 0;
      if (active) schedule();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    destroy: function() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      if (reduce.removeEventListener) reduce.removeEventListener("change", onMotionPref);
      if (io) io.disconnect();
    }
  };
}
export {
  makeNight
};
