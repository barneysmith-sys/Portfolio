// ls-build/livingScene.ts
function makeScene(wrap, canvas, urls) {
  var SW = 442, SH = 444;
  var ML = 40, MR = 170, MT = 150, MB = 20;
  var CW = SW + ML + MR, CH = SH + MT + MB;
  var FW = 120, FH = 110, FX = 20, FY = 45;
  var PERCH = { x: 356, y: 119 };
  var HEAD_PIV = [20, 20], TAIL_PIV = [51, 42], EYE = [18, 11];
  var LEGS = [[22, 46, 51], [33, 46, 49]];
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var rnd = Math.random, R = function(a, b) {
    return a + rnd() * (b - a);
  };
  var clamp = function(v, a, b) {
    return v < a ? a : v > b ? b : v;
  };
  var dead = false, raf = 0, visible = true, onScreen = true, active = true;
  var VISITS = false;
  var imgs = {}, pending = 3;
  ["foliage", "stat", "atlas"].forEach(function(k) {
    var im = new Image();
    im.onload = function() {
      if (--pending === 0) ready();
    };
    im.src = urls[k];
    imgs[k] = im;
  });
  var folSrc, folOut, folImg = null, folCtx, folCanvas = null, edgeF, rigid, cellPh, gold = [];
  var birdC = document.createElement("canvas");
  birdC.width = FW;
  birdC.height = FH;
  var bctx = birdC.getContext("2d");
  var headC = document.createElement("canvas");
  headC.width = FW;
  headC.height = FH;
  var hctx = headC.getContext("2d");
  var blinkCol = "rgb(150,86,44)";
  function ready() {
    if (dead) return;
    folCanvas = document.createElement("canvas");
    folCanvas.width = SW;
    folCanvas.height = SH;
    folCtx = folCanvas.getContext("2d", { willReadFrequently: true });
    folCtx.drawImage(imgs.foliage, 0, 0);
    try {
      folImg = folCtx.getImageData(0, 0, SW, SH);
    } catch (err) {
      folImg = null;
    }
    if (!folImg) {
      canvas.style.opacity = "1";
      start();
      return;
    }
    folSrc = new Uint32Array(folImg.data.buffer.slice(0));
    folOut = new Uint32Array(folImg.data.buffer);
    var N = SW * SH, a = new Float32Array(N), i, x, y;
    for (i = 0; i < N; i++) a[i] = (folSrc[i] >>> 24) / 255;
    var dens = boxBlur(boxBlur(a, 6), 6);
    edgeF = new Float32Array(N);
    rigid = new Float32Array(N * 2);
    for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
      i = y * SW + x;
      edgeF[i] = clamp(1.25 - dens[i] * 1.4, 0.15, 1);
      var reach = clamp((Math.abs(x - 150) - 12) / 170, 0, 1);
      var up = clamp((240 - y) / 220, 0, 1) * 0.35;
      rigid[i * 2] = Math.pow(clamp(reach + up * reach, 0, 1), 1.25);
      rigid[i * 2 + 1] = (x - 150) / 300;
      var c = folSrc[i], r = c & 255, g = c >>> 8 & 255, b = c >>> 16 & 255;
      if (c >>> 24 > 220 && r > 165 && g > 120 && b < 95 && edgeF[i] > 0.45 && y > 60) gold.push(i);
    }
    cellPh = new Float32Array(Math.ceil(SW / 5) * Math.ceil(SH / 5));
    for (i = 0; i < cellPh.length; i++) cellPh[i] = rnd() * Math.PI * 2;
    var tcv = document.createElement("canvas");
    tcv.width = 1;
    tcv.height = 1;
    var tc = tcv.getContext("2d");
    tc.drawImage(imgs.atlas, FW + FX + EYE[0] + 1, FY + EYE[1] - 3, 1, 1, 0, 0, 1, 1);
    try {
      var p = tc.getImageData(0, 0, 1, 1).data;
      blinkCol = "rgb(" + p[0] + "," + p[1] + "," + p[2] + ")";
    } catch (err) {
    }
    canvas.style.opacity = "1";
    start();
  }
  function boxBlur(src, r) {
    var out = new Float32Array(src.length), tmp = new Float32Array(src.length), x, y, s;
    for (y = 0; y < SH; y++) {
      s = 0;
      for (x = -r; x <= r; x++) s += src[y * SW + clamp(x, 0, SW - 1)];
      for (x = 0; x < SW; x++) {
        tmp[y * SW + x] = s / (2 * r + 1);
        s += src[y * SW + clamp(x + r + 1, 0, SW - 1)] - src[y * SW + clamp(x - r, 0, SW - 1)];
      }
    }
    for (x = 0; x < SW; x++) {
      s = 0;
      for (y = -r; y <= r; y++) s += tmp[clamp(y, 0, SH - 1) * SW + x];
      for (y = 0; y < SH; y++) {
        out[y * SW + x] = s / (2 * r + 1);
        s += tmp[clamp(y + r + 1, 0, SH - 1) * SW + x] - tmp[clamp(y - r, 0, SH - 1) * SW + x];
      }
    }
    return out;
  }
  var gusts = [], nextGust = R(5, 11), colG = new Float32Array(SW);
  function gustEnv(tau) {
    if (tau <= 0) return 0;
    return (1 - Math.exp(-tau / 0.7)) * Math.exp(-tau / 2.4) * 1.9 + Math.sin(tau * 2.1) * Math.exp(-tau / 1.6) * 0.12;
  }
  function addGust(t2, s) {
    gusts.push({ t0: t2, s });
  }
  function windAt(t2) {
    return 0.55 * Math.sin(t2 * 0.31) + 0.35 * Math.sin(t2 * 0.53 + 1.3) + 0.18 * Math.sin(t2 * 1.07 + 2.1);
  }
  var lastFol = -1, gustLevel = 0;
  function updateFoliage(t2) {
    if (!folImg) return;
    if (t2 - lastFol < 0.033) return;
    lastFol = t2;
    if (t2 > nextGust) {
      addGust(t2, R(0.55, 1.1));
      nextGust = t2 + R(7, 19);
    }
    gusts = gusts.filter(function(g) {
      return t2 - g.t0 < 9;
    });
    var x, y, i, gl = 0;
    for (x = 0; x < SW; x++) {
      var s = 0, lag = (SW - x) / 170;
      for (var k = 0; k < gusts.length; k++) s += gusts[k].s * gustEnv(t2 - gusts[k].t0 - lag);
      colG[x] = s;
      gl += s;
    }
    gustLevel = gl / SW;
    var base = windAt(t2), baseL = windAt(t2 - 0.6), baseB = windAt(t2 - 0.35);
    var cw = Math.ceil(SW / 5), flt = new Float32Array(cellPh.length), w2 = t2 * 2.3;
    for (i = 0; i < flt.length; i++) flt[i] = Math.sin(w2 + cellPh[i]) + 0.5 * Math.sin(w2 * 1.7 + cellPh[i] * 2.3);
    var flAmp = 0.55 + gustLevel * 0.9;
    for (y = 0; y < SH; y++) {
      var wTop = clamp((230 - y) / 60, 0, 1), cy = y / 5 | 0;
      for (x = 0; x < SW; x++) {
        i = y * SW + x;
        var f = rigid[i * 2];
        if (f === 0) {
          folOut[i] = folSrc[i];
          continue;
        }
        var b = x < 150 ? baseL : wTop * base + (1 - wTop) * baseB;
        var S = f * (b * 1.05 - colG[x] * 1.6);
        var fl = flt[cy * cw + (x / 5 | 0)] * flAmp * edgeF[i] * Math.sqrt(f);
        var dx = S + fl, dy = S * rigid[i * 2 + 1] * 0.9 + fl * 0.35;
        var sx = x - dx + 0.5 | 0, sy = y - dy + 0.5 | 0;
        folOut[i] = sx >= 0 && sy >= 0 && sx < SW && sy < SH ? folSrc[sy * SW + sx] : 0;
      }
    }
    folCtx.putImageData(folImg, 0, 0);
  }
  var leaves = [], nextLeaf = R(9, 16);
  function spawnLeaf(t2) {
    if (!gold.length) return;
    var i = gold[rnd() * gold.length | 0], c = folSrc[i];
    var r = c & 255, g = c >>> 8 & 255, b = c >>> 16 & 255;
    leaves.push({
      x: i % SW,
      y: i / SW | 0,
      vy: R(7, 11),
      ph: R(0, 6.28),
      spin: R(2.2, 3.6),
      sway: R(6, 11),
      born: t2,
      life: R(9, 13),
      c1: "rgb(" + r + "," + g + "," + b + ")",
      c2: "rgb(" + (r * 0.8 | 0) + "," + (g * 0.75 | 0) + "," + (b * 0.7 | 0) + ")"
    });
  }
  function updateLeaves(t2, dt) {
    if (!folImg) return;
    if (t2 > nextLeaf) {
      spawnLeaf(t2);
      if (rnd() < 0.35) spawnLeaf(t2 + 0.4);
      nextLeaf = t2 + R(15, 30);
    }
    for (var k = leaves.length - 1; k >= 0; k--) {
      var L = leaves[k], age = t2 - L.born;
      L.vy = Math.min(L.vy + dt * 1.2, 15);
      L.y += L.vy * dt;
      L.x += (Math.cos(age * 1.3 + L.ph) * L.sway - gustLevel * 14 - 1.5) * dt;
      if (age > L.life || L.y > SH + MB - 4) leaves.splice(k, 1);
    }
  }
  function drawLeaves(t2) {
    for (var k = 0; k < leaves.length; k++) {
      var L = leaves[k], age = t2 - L.born;
      var a = clamp(Math.min(age / 0.6, (L.life - age) / (L.life * 0.35)), 0, 1);
      var w = Math.round(1 + 2 * Math.abs(Math.cos(age * L.spin + L.ph)));
      var x = Math.round(L.x + ML), y = Math.round(L.y + MT);
      ctx.globalAlpha = a;
      ctx.fillStyle = L.c1;
      ctx.fillRect(x - (w >> 1), y, w, 2);
      ctx.fillStyle = L.c2;
      ctx.fillRect(x - (w >> 1), y + 2, Math.max(1, w - 1), 1);
    }
    ctx.globalAlpha = 1;
  }
  var B = {
    mode: VISITS ? "away" : "perch",
    t0: 0,
    dur: 1,
    until: R(2, 4),
    x: PERCH.x,
    y: PERCH.y,
    wing: -1,
    headA: 0,
    headAT: 0,
    flip: false,
    tailA: 0,
    pitch: 0,
    mirror: false,
    legs: "perch",
    legShift: [0, 0],
    blink: false,
    puff: 1,
    dy: 0,
    hop: 0,
    nextIdle: R(2.5, 5),
    idleEnd: 0,
    nextBlink: R(2, 4),
    perchEnd: VISITS ? 0 : Infinity,
    path: [],
    returnAt: 0,
    hoverCool: 0,
    clickFly: -99
  };
  function bez(p, t2) {
    var u = 1 - t2;
    return [
      u * u * u * p[0][0] + 3 * u * u * t2 * p[1][0] + 3 * u * t2 * t2 * p[2][0] + t2 * t2 * t2 * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t2 * p[1][1] + 3 * u * t2 * t2 * p[2][1] + t2 * t2 * t2 * p[3][1]
    ];
  }
  function flapFrame(t2, speed) {
    var seq = [3, 2, 1, 0, 1, 2];
    return seq[(t2 * speed | 0) % 6];
  }
  function beginArrival(t2) {
    var sx = SW + MR + 30 + R(0, 30), sy = -MT - 20 - R(0, 50);
    B.path = [[sx, sy], [PERCH.x + R(120, 190), PERCH.y - R(110, 170)], [PERCH.x + R(30, 60), PERCH.y - R(40, 70)], [PERCH.x + 5, PERCH.y - 12]];
    B.mode = "arrive";
    B.t0 = t2;
    B.dur = R(2.3, 3);
    B.mirror = false;
    B.flip = false;
    B.headAT = 0;
    B.headA = 0;
  }
  function beginTakeoff(t2, startled) {
    B.mode = "takeoff";
    B.t0 = t2;
    B.startled = !!startled;
    B.flip = false;
    B.headAT = 0;
    B.idleEnd = 0;
    B.hopT = 0;
  }
  function beginDepart(t2) {
    var right = rnd() < 0.7;
    B.mirror = right;
    var ex = right ? SW + MR + 60 : -ML - 100 + R(0, 60), ey = -MT - 80;
    B.path = [[PERCH.x, PERCH.y], [PERCH.x + (right ? 25 : -20), PERCH.y - 35], [right ? PERCH.x + 140 : PERCH.x - 90, PERCH.y - 120], [ex, ey]];
    B.mode = "depart";
    B.t0 = t2;
    B.dur = R(1.6, 2.2);
  }
  function scheduleIdle(t2) {
    B.nextIdle = t2 + R(1.6, 5.5);
  }
  function doIdle(t2) {
    var r = rnd();
    if (r < 0.22) {
      scheduleIdle(t2 + R(1, 3));
      return;
    }
    B.idleEnd = t2 + R(0.6, 2.2);
    if (r < 0.34) {
      B.flip = true;
    } else if (r < 0.55) {
      B.headAT = R(0.1, 0.17) * (rnd() < 0.5 ? -1 : 1);
    } else if (r < 0.65) {
      B.headAT = -0.26;
      B.idleEnd = t2 + R(0.5, 1.1);
    } else if (r < 0.75) {
      B.tailFlick = t2;
      B.idleEnd = t2 + 0.1;
    } else if (r < 0.84) {
      B.ruffle = t2;
      B.idleEnd = t2 + 0.1;
    } else if (r < 0.92) {
      var k = rnd() < 0.5 ? 0 : 1;
      B.legShift[k] = B.legShift[k] ? 0 : rnd() < 0.5 ? -1 : 1;
      B.hopSmall = t2;
      B.idleEnd = t2 + 0.1;
    } else {
      B.flip = true;
      B.headAT = 0.1;
    }
    scheduleIdle(B.idleEnd);
  }
  function endIdle() {
    B.flip = false;
    B.headAT = 0;
    B.idleEnd = 0;
  }
  function updateBird(t2, dt) {
    B.headA += (B.headAT - B.headA) * Math.min(1, dt * 22);
    if (t2 > B.nextBlink) {
      B.blinkUntil = t2 + 0.11;
      B.nextBlink = t2 + (rnd() < 0.15 ? 0.25 : R(2.5, 7));
    }
    B.blink = t2 < (B.blinkUntil || 0);
    B.tailA = 0;
    B.puff = 1;
    B.dy = 0;
    B.hop = 0;
    B.wing = -1;
    B.pitch = 0;
    if (B.tailFlick) {
      var a = t2 - B.tailFlick;
      if (a < 0.32) B.tailA = -0.3 * Math.sin(Math.PI * Math.min(1, a / 0.32));
      else B.tailFlick = 0;
    }
    if (B.ruffle) {
      var q = t2 - B.ruffle;
      if (q < 0.42) B.puff = 1 + 0.06 * Math.abs(Math.sin(q * 15));
      else B.ruffle = 0;
    }
    if (B.mode === "away") {
      if (t2 > B.until) beginArrival(t2);
      return;
    }
    if (B.mode === "arrive") {
      var u = clamp((t2 - B.t0) / B.dur, 0, 1), e = 1 - Math.pow(1 - u, 2.1);
      var p = bez(B.path, e), p2 = bez(B.path, Math.min(1, e + 0.02));
      B.x = p[0];
      B.y = p[1];
      B.pitch = clamp(-Math.atan2(p2[1] - p[1], -(p2[0] - p[0])) * 0.45, -0.3, 0.2);
      var cyc = (t2 - B.t0) % 0.72;
      B.wing = u < 0.72 && cyc > 0.48 ? -1 : flapFrame(t2, u > 0.75 ? 19 : 24);
      B.legs = u > 0.85 ? "out" : "none";
      if (u >= 1) {
        B.mode = "land";
        B.t0 = t2;
      }
      return;
    }
    if (B.mode === "land") {
      var l = clamp((t2 - B.t0) / 0.42, 0, 1), le = 1 - Math.pow(1 - l, 2);
      B.x = PERCH.x + 5 * (1 - le);
      B.y = PERCH.y - 12 * (1 - le);
      B.pitch = 0.2 * (1 - le);
      B.wing = l < 0.75 ? [0, 1][(t2 * 13 | 0) % 2] : 1;
      B.legs = l < 0.6 ? "out" : "perch";
      if (l >= 1) {
        B.mode = "settle";
        B.t0 = t2;
      }
      return;
    }
    if (B.mode === "settle") {
      var s = t2 - B.t0;
      B.x = PERCH.x;
      B.y = PERCH.y;
      B.legs = "perch";
      B.wing = s < 0.12 ? 2 : -1;
      B.dy = s < 0.1 ? 1 : 0;
      if (s > 0.18 && s < 0.5) B.tailA = -0.18 * Math.sin((s - 0.18) / 0.32 * Math.PI);
      if (s > 0.6) {
        B.mode = "perch";
        B.perchEnd = VISITS ? t2 + R(20, 35) : Infinity;
        B.nextIdle = t2 + R(0.8, 2);
      }
      return;
    }
    if (B.mode === "perch") {
      B.x = PERCH.x;
      B.y = PERCH.y;
      B.legs = "perch";
      if (B.hopSmall && t2 - B.hopSmall < 0.12) B.dy = -1;
      else B.hopSmall = 0;
      if (B.hopT) {
        var h = (t2 - B.hopT) / 0.34;
        if (h < 1) {
          B.hop = -Math.round(6 * Math.sin(Math.PI * h));
          B.wing = h > 0.15 && h < 0.6 ? 2 : -1;
          B.legs = h > 0.1 && h < 0.85 ? "out" : "perch";
        } else B.hopT = 0;
      }
      if (B.idleEnd && t2 > B.idleEnd) endIdle();
      if (!B.idleEnd && t2 > B.nextIdle) doIdle(t2);
      if (t2 > B.perchEnd) beginTakeoff(t2);
      return;
    }
    if (B.mode === "takeoff") {
      var k = t2 - B.t0, look = B.startled ? 0.15 : 1.1;
      B.x = PERCH.x;
      B.y = PERCH.y;
      B.legs = "perch";
      if (k < look) {
        B.flip = k > look * 0.3 && k < look * 0.7;
        B.headAT = k < look * 0.3 ? -0.08 : 0;
      } else if (k < look + 0.22) {
        B.flip = false;
        B.headAT = 0;
        B.dy = 1;
        B.tailA = -0.22;
      } else if (k < look + 0.34) {
        B.dy = 1;
        B.wing = 2;
        B.tailA = -0.2;
      } else beginDepart(t2);
      return;
    }
    if (B.mode === "depart") {
      var d = clamp((t2 - B.t0) / B.dur, 0, 1), de = Math.pow(d, 1.6);
      var q1 = bez(B.path, de), q2 = bez(B.path, Math.min(1, de + 0.02));
      B.x = q1[0];
      B.y = q1[1];
      var ang = Math.atan2(q2[1] - q1[1], B.mirror ? q2[0] - q1[0] : -(q2[0] - q1[0]));
      B.pitch = clamp(-ang * 0.45, -0.3, 0.35);
      var c2 = (t2 - B.t0) % 0.7;
      B.wing = d > 0.35 && c2 > 0.5 ? -1 : flapFrame(t2, 24);
      B.legs = d < 0.12 ? "out" : "none";
      if (d >= 1) {
        B.mode = "away";
        B.until = B.returnAt || t2 + R(12, 30);
        B.returnAt = 0;
        B.mirror = false;
      }
    }
  }
  function drawBird() {
    if (B.mode === "away") return;
    var at = imgs.atlas, dy = B.dy;
    bctx.clearRect(0, 0, FW, FH);
    bctx.imageSmoothingEnabled = false;
    if (B.wing === 0 || B.wing === 1) bctx.drawImage(at, (7 + B.wing) * FW, 0, FW, FH, 0, dy, FW, FH);
    if (B.legs !== "none") {
      bctx.fillStyle = "rgb(104,86,74)";
      for (var k = 0; k < 2; k++) {
        var lx = FX + LEGS[k][0] + B.legShift[k], hip = FY + LEGS[k][1] + dy;
        if (B.legs === "perch") {
          var foot = FY + LEGS[k][2];
          bctx.fillRect(lx, hip, 1, Math.max(1, foot - hip));
          bctx.fillRect(lx - 2, foot - 1, 3, 1);
        } else {
          bctx.fillRect(lx - 1, hip, 1, 3);
          bctx.fillRect(lx - 2, hip + 3, 1, 2);
          bctx.fillRect(lx - 4, hip + 5, 3, 1);
        }
      }
    }
    bctx.save();
    bctx.translate(FX + TAIL_PIV[0], FY + TAIL_PIV[1] + dy);
    bctx.rotate(B.tailA);
    bctx.drawImage(at, 2 * FW, 0, FW, FH, -(FX + TAIL_PIV[0]), -(FY + TAIL_PIV[1]), FW, FH);
    bctx.restore();
    bctx.save();
    var cx = FX + 32, cy = FY + 32;
    bctx.translate(cx, cy + dy);
    bctx.scale(B.puff, B.puff);
    bctx.drawImage(at, 0, 0, FW, FH, -cx, -cy, FW, FH);
    bctx.restore();
    hctx.clearRect(0, 0, FW, FH);
    hctx.imageSmoothingEnabled = false;
    hctx.drawImage(at, FW, 0, FW, FH, 0, 0, FW, FH);
    if (B.blink) {
      hctx.fillStyle = blinkCol;
      hctx.fillRect(FX + EYE[0] - 2, FY + EYE[1] - 1, 4, 3);
    }
    bctx.save();
    bctx.translate(FX + HEAD_PIV[0], FY + HEAD_PIV[1] + dy);
    bctx.rotate(B.headA);
    if (B.flip) bctx.scale(-1, 1);
    bctx.drawImage(headC, -(FX + HEAD_PIV[0]), -(FY + HEAD_PIV[1]));
    bctx.restore();
    if (B.wing >= 0) bctx.drawImage(at, (3 + B.wing) * FW, 0, FW, FH, 0, dy, FW, FH);
    var bx = B.x + ML + 38, by = B.y + MT + B.hop + 28;
    var a = clamp(Math.min(bx + 20, CW - bx, by + 10, CH - by) / 55, 0, 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(bx), Math.round(by));
    if (B.mirror) ctx.scale(-1, 1);
    ctx.rotate(B.pitch);
    ctx.drawImage(birdC, -(FX + 38), -(FY + 28));
    ctx.restore();
  }
  var t = 0, last = 0;
  function frame(now) {
    raf = 0;
    if (dead) return;
    var dt = last ? Math.min(0.05, (now - last) / 1e3) : 0.016;
    last = now;
    t += dt;
    updateFoliage(t);
    updateLeaves(t, dt);
    updateBird(t, dt);
    draw(t);
    schedule();
  }
  function draw(time) {
    ctx.clearRect(0, 0, CW, CH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(folImg && folCanvas ? folCanvas : imgs.foliage, ML, MT);
    ctx.drawImage(imgs.stat, ML, MT);
    drawLeaves(time);
    drawBird();
  }
  function schedule() {
    if (!raf && !dead && active && visible && onScreen && !reduce.matches) raf = requestAnimationFrame(frame);
  }
  function drawStill() {
    if (folImg) {
      folOut.set(folSrc);
      folCtx.putImageData(folImg, 0, 0);
    }
    leaves = [];
    B.mode = "perch";
    B.x = PERCH.x;
    B.y = PERCH.y;
    B.legs = "perch";
    B.wing = -1;
    B.flip = false;
    B.headA = 0;
    B.headAT = 0;
    B.tailA = 0;
    B.puff = 1;
    B.dy = 0;
    B.hop = 0;
    B.pitch = 0;
    B.mirror = false;
    B.blink = false;
    B.idleEnd = 0;
    B.hopT = 0;
    draw(0);
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
    if (!folCanvas) return;
    if (reduce.matches) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      drawStill();
    } else {
      B.perchEnd = VISITS ? t + R(10, 20) : Infinity;
      scheduleIdle(t);
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
  function toScene(e) {
    var r = wrap.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * SW, (e.clientY - r.top) / r.height * SH];
  }
  function overBird(p) {
    return B.mode === "perch" && p[0] > PERCH.x - 4 && p[0] < PERCH.x + 82 && p[1] > PERCH.y + 2 && p[1] < PERCH.y + 56;
  }
  function overLeaves(p) {
    if (!folImg) return false;
    var x = p[0] | 0, y = p[1] | 0;
    return x >= 0 && y >= 0 && x < SW && y < SH && folSrc[y * SW + x] >>> 24 > 120;
  }
  var lastBreeze = -9;
  function onMove(e) {
    if (!active || reduce.matches || !folCanvas) return;
    var p = toScene(e);
    if (overBird(p)) {
      if (t > B.hoverCool && !B.idleEnd && !B.hopT) {
        B.hoverCool = t + R(3.5, 6);
        if (p[0] > PERCH.x + 46) B.flip = true;
        else B.headAT = p[1] < PERCH.y + 20 ? 0.1 : -0.12;
        B.idleEnd = t + R(0.8, 1.4);
        B.nextIdle = B.idleEnd + R(1, 3);
      }
    } else if (overLeaves(p) && t - lastBreeze > 3) {
      lastBreeze = t;
      addGust(t, R(0.3, 0.45));
    }
  }
  function onClick(e) {
    if (!active || reduce.matches || !folCanvas) return;
    var p = toScene(e);
    if (!overBird(p)) return;
    var r = rnd();
    if (VISITS && r < 0.22 && t - B.clickFly > 25) {
      B.clickFly = t;
      B.returnAt = t + R(6, 10);
      beginTakeoff(t, true);
    } else if (r < 0.65) {
      endIdle();
      B.hopT = t;
    } else {
      endIdle();
      B.headAT = 0.2;
      B.idleEnd = t + R(0.7, 1.1);
      B.nextIdle = B.idleEnd + 2;
    }
  }
  wrap.addEventListener("pointermove", onMove);
  wrap.addEventListener("click", onClick);
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
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("click", onClick);
    }
  };
}
export {
  makeScene
};
