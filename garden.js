/* The living garden: locally hosted Three.js r128, photographic surfaces,
   instanced foliage, a solar aureole, static light shadows and an accessible orbit camera.
   See GARDEN.md for controls, maintenance, asset sources and licensing. */
(function () {
  "use strict";
  var seed = 82419;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }


  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var smallScreen  = window.matchMedia("(max-width: 768px)");

  function reveal(el) { el.classList.add('visible'); }
  var revealEls = document.querySelectorAll(".reveal");
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          reveal(entry.target);
          io.unobserve(entry.target);       // reveal once, then forget
        }
      });
    }, { threshold: 0.18 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 1b · Loading veil: lift when ready, never trap ---------- */
  (function veil() {
    var v = document.getElementById("veil");
    if (!v) return;
    var gone = false;
    function lift() {
      if (gone) return;
      gone = true;
      v.classList.add("gone");
    }
    if (document.readyState === "complete") { setTimeout(lift, 350); }
    else { window.addEventListener("load", function () { setTimeout(lift, 350); }); }
    setTimeout(lift, 4500);                     // hard ceiling — never trap
  })();

  /* ---------- 2 · Bail out gracefully without WebGL ---------- */
  if (typeof THREE === "undefined") return;   // CDN failed → CSS sky

  var canvas = document.getElementById("scene");
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  } catch (e) { return; }                     // no WebGL → CSS sky

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,
                                  smallScreen.matches ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  /* static garden → render shadow maps once, not per frame */
  renderer.shadowMap.autoUpdate = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;   // bright but never blown out

  var scene = new THREE.Scene();
  /* Cool dusk haze preserves depth around the warm central light. */
  scene.fog = new THREE.FogExp2(0x84938c, 0.010);

  var camera = new THREE.PerspectiveCamera(
    42, window.innerWidth / window.innerHeight, 0.1, 260);

  /* The point everything revolves around: the statue's heart */
  var FOCUS = new THREE.Vector3(0, 3.55, 0);

  /* ---------- 3 · Procedural texture engine (fBm + bump) ---------- */
  var maxAniso = 1;
  try { maxAniso = renderer.capabilities.getMaxAnisotropy(); } catch (e) {}

  /* seamless multi-octave value noise — the basis of every material */
  function fbm(size, octaves, freq0) {
    var h = new Float32Array(size * size), tot = 0, amp = 1, freq = freq0;
    for (var o = 0; o < octaves; o++) {
      var g = freq, grid = new Float32Array(g * g);
      for (var i = 0; i < g * g; i++) grid[i] = random();
      for (var y = 0; y < size; y++) {
        var fy = y / size * g, y0 = fy | 0, ty = fy - y0;
        ty = ty * ty * (3 - 2 * ty);
        var y1 = (y0 + 1) % g;
        for (var x = 0; x < size; x++) {
          var fx = x / size * g, x0 = fx | 0, tx = fx - x0;
          tx = tx * tx * (3 - 2 * tx);
          var x1 = (x0 + 1) % g;
          var a = grid[y0 * g + x0], b2 = grid[y0 * g + x1],
              c2 = grid[y1 * g + x0], d = grid[y1 * g + x1];
          h[y * size + x] += amp *
            ((a + (b2 - a) * tx) * (1 - ty) + (c2 + (d - c2) * tx) * ty);
        }
      }
      tot += amp; amp *= 0.55; freq *= 2;
    }
    for (var k = 0; k < h.length; k++) h[k] /= tot;
    return h;
  }

  /* height field → colour canvas through a colour ramp */
  function rampCanvas(size, h, stops) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    var img = g.createImageData(size, size);
    for (var i = 0; i < h.length; i++) {
      var t = h[i], j = 0;
      while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
      var f = (t - stops[j][0]) / (stops[j + 1][0] - stops[j][0]);
      f = Math.min(1, Math.max(0, f));
      var A = stops[j][1], B = stops[j + 1][1];
      img.data[i * 4]     = A[0] + (B[0] - A[0]) * f;
      img.data[i * 4 + 1] = A[1] + (B[1] - A[1]) * f;
      img.data[i * 4 + 2] = A[2] + (B[2] - A[2]) * f;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* height field → grayscale bump canvas */
  function bumpCanvas(size, h, gain) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    var img = g.createImageData(size, size);
    for (var i = 0; i < h.length; i++) {
      var v = Math.min(255, Math.max(0, 128 + (h[i] - 0.5) * 255 * gain));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* height field → tangent-space normal map (Sobel derivative) */
  function normalCanvas(size, h, strength) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    var img = g.createImageData(size, size);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var xm = (x - 1 + size) % size, xp = (x + 1) % size;
        var ym = (y - 1 + size) % size, yp = (y + 1) % size;
        var dx = (h[y * size + xp] - h[y * size + xm]) * strength;
        var dy = (h[yp * size + x] - h[ym * size + x]) * strength;
        var inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        var i4 = (y * size + x) * 4;
        img.data[i4]     = (-dx * inv * 0.5 + 0.5) * 255;
        img.data[i4 + 1] = (-dy * inv * 0.5 + 0.5) * 255;
        img.data[i4 + 2] = (inv * 0.5 + 0.5) * 255;
        img.data[i4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function toTex(c, rx, ry, srgb) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;   // colour maps only
    t.anisotropy = maxAniso;
    if (rx) t.repeat.set(rx, ry);
    return t;
  }

  /* stamp individual leaves — turns flat green into foliage */
  function stampLeaves(g, size, n, colors, s0, s1, alpha) {
    for (var i = 0; i < n; i++) {
      g.save();
      g.translate(random() * size, random() * size);
      g.rotate(random() * Math.PI * 2);
      var L = s0 + random() * (s1 - s0);
      g.globalAlpha = alpha * (0.55 + random() * 0.45);
      g.fillStyle = colors[(random() * colors.length) | 0];
      g.beginPath();
      g.ellipse(0, 0, L, L * 0.42, 0, 0, 7);
      g.fill();
      g.globalAlpha *= 0.5;                     // midrib highlight
      g.strokeStyle = "#a9c98a"; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
  }

  /* --- GRASS (procedural base; photo upgrade streams in later) --- */
  var grassH = fbm(256, 5, 4);
  var grassC = rampCanvas(256, grassH, [
    [0, [56, 82, 38]], [0.45, [96, 126, 66]],
    [0.75, [122, 152, 80]], [1, [152, 178, 98]]]);
  (function blades(g) {                          // fine blade strokes
    for (var i = 0; i < 800; i++) {
      var x = random() * 256, y = random() * 256;
      var len = 3 + random() * 6, dx = random() * 4 - 2;
      g.strokeStyle = ["#3f5f2c", "#77a052", "#55793c", "#8fb468"][(random() * 4) | 0];
      g.globalAlpha = 0.16 + random() * 0.12;
      g.lineWidth = 0.7 + random() * 0.7;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + dx * 0.4, y - len * 0.6, x + dx, y - len);
      g.stroke();
    }
    g.globalAlpha = 1;
  })(grassC.getContext("2d"));
  (function mowingStripes(g) {          // alternating light/dark bands
    for (var sI = 0; sI < 8; sI++) {
      g.fillStyle = sI % 2 ? "rgba(255,255,238,0.05)" : "rgba(16,36,12,0.055)";
      g.fillRect(sI * 32, 0, 32, 256);
    }
  })(grassC.getContext("2d"));
  var grassTex  = toTex(grassC, 22, 22, true);
  var grassBump = toTex(bumpCanvas(256, grassH, 0.7), 22, 22, false);

  /* --- GRAVEL: noise + individual pebbles --- */
  var gravelH = fbm(256, 4, 6);
  var gravelC = rampCanvas(256, gravelH, [
    [0, [168, 152, 120]], [0.5, [200, 186, 154]], [1, [226, 214, 186]]]);
  (function pebbles(g) {
    for (var i = 0; i < 420; i++) {
      var x = random() * 256, y = random() * 256,
          r = 1 + random() * 2.6, a = random() * Math.PI;
      g.globalAlpha = 0.5;
      g.fillStyle = "#8f8266";                   // pebble shadow
      g.beginPath(); g.ellipse(x + 0.7, y + 0.9, r, r * 0.75, a, 0, 7); g.fill();
      g.globalAlpha = 0.85;
      g.fillStyle = ["#cbbc9a", "#e2d6b8", "#b3a583", "#d8cbac"][(random() * 4) | 0];
      g.beginPath(); g.ellipse(x, y, r, r * 0.75, a, 0, 7); g.fill();
      g.globalAlpha = 0.4;
      g.fillStyle = "#f4ecd8";                   // top-light
      g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.3, a, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  })(gravelC.getContext("2d"));
  var gravelTex  = toTex(gravelC, 6, 6, true);
  var gravelBump = toTex(bumpCanvas(256, gravelH, 0.8), 6, 6, false);

  /* --- BOXWOOD HEDGE: leafy noise, leaf-stamped bump --- */
  var hedgeH = fbm(256, 4, 5);
  var hedgeC = rampCanvas(256, hedgeH, [
    [0, [16, 40, 20]], [0.45, [38, 66, 30]], [0.75, [62, 94, 44]], [1, [88, 122, 58]]]);
  stampLeaves(hedgeC.getContext("2d"), 256, 950,
    ["#1b3a1e", "#2f5426", "#48703a", "#5c8a44", "#729e50"], 2.2, 4.6, 0.75);
  var hedgeBumpC = bumpCanvas(256, hedgeH, 0.6);
  (function leafBumps(g) {                       // leaves catch light
    for (var i = 0; i < 700; i++) {
      g.save();
      g.translate(random() * 256, random() * 256);
      g.rotate(random() * Math.PI * 2);
      var L = 2 + random() * 3.5;
      g.globalAlpha = 0.35;
      g.fillStyle = random() < 0.5 ? "#e8e8e8" : "#404040";
      g.beginPath(); g.ellipse(0, 0, L, L * 0.42, 0, 0, 7); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  })(hedgeBumpC.getContext("2d"));
  /* NOTE: no baked vertical shade gradient — it repeats with the UVs
     and paints seam bands across spheres and hedge tubes */
  var hedgeTex  = toTex(hedgeC, 3, 2, true);
  var hedgeBump = toTex(hedgeBumpC, 3, 2, false);

  /* --- CYPRESS: darker foliage with vertical grain --- */
  var cypH = fbm(256, 4, 5);
  var cypC = rampCanvas(256, cypH, [   /* deep BLUE-green columnar tone */
    [0, [10, 28, 22]], [0.5, [24, 50, 40]], [0.8, [38, 72, 54]], [1, [56, 92, 68]]]);
  stampLeaves(cypC.getContext("2d"), 256, 800,
    ["#122b16", "#224222", "#33582e", "#44703a"], 1.6, 3.4, 0.7);
  (function streaks(g) {                          // sprays grow upward
    for (var i = 0; i < 90; i++) {
      var x = random() * 256;
      g.strokeStyle = random() < 0.5 ? "#0e2412" : "#3c6234";
      g.globalAlpha = 0.10 + random() * 0.10;
      g.lineWidth = 1 + random() * 2;
      g.beginPath(); g.moveTo(x, 0);
      g.quadraticCurveTo(x + random() * 12 - 6, 128, x + random() * 10 - 5, 256);
      g.stroke();
    }
    g.globalAlpha = 1;
  })(cypC.getContext("2d"));
  var cypressTex  = toTex(cypC, 2, 3, true);
  var cypressBump = toTex(bumpCanvas(256, cypH, 0.65), 2, 3, false);

  /* --- SANDSTONE: weathered surface only — the masonry courses are
         now REAL geometry (instanced blocks), not painted lines --- */
  var stoneH = fbm(512, 5, 3);
  var stoneC = rampCanvas(512, stoneH, [
    [0, [178, 158, 122]], [0.4, [206, 190, 156]], [0.75, [226, 212, 182]], [1, [238, 228, 202]]]);
  var stoneBumpC = bumpCanvas(512, stoneH, 0.6);
  (function weathering(cc) {
    var g2 = cc.getContext("2d");
    /* chips and pock-marks */
    for (var i = 0; i < 260; i++) {
      g2.globalAlpha = 0.08 + random() * 0.12;
      g2.fillStyle = random() < 0.5 ? "#a8977a" : "#efe6d0";
      g2.beginPath();
      g2.ellipse(random() * 512, random() * 512,
                 2 + random() * 7, 1.5 + random() * 5,
                 random() * Math.PI, 0, 7);
      g2.fill();
    }
    /* damp green staining creeping up from the ground */
    for (var s = 0; s < 46; s++) {
      g2.globalAlpha = 0.05 + random() * 0.06;
      g2.fillStyle = random() < 0.6 ? "#7c8a5a" : "#8c7f5c";
      g2.beginPath();
      g2.ellipse(random() * 512, 380 + random() * 130,
                 18 + random() * 42, 10 + random() * 26, 0, 0, 7);
      g2.fill();
    }
    g2.globalAlpha = 1;
  })(stoneC);
  var stoneTex  = toTex(stoneC, 1, 1, true);
  var stoneBump = toTex(stoneBumpC, 1, 1, false);
  /* real relief for the stone: normal map + crevice roughness map */
  var stoneNormal = toTex(normalCanvas(512, stoneH, 4.2), 1, 1, false);
  var stoneRoughC = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 512;
    var g = c.getContext("2d");
    var img = g.createImageData(512, 512);
    for (var i = 0; i < stoneH.length; i++) {
      var v = Math.min(255, Math.max(0, 250 - stoneH[i] * 60)); // crevices roughest
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  })();
  var stoneRough = toTex(stoneRoughC, 1, 1, false);

  /* --- MARBLE: near-white field crossed by wandering veins --- */
  /* tree canopy: olive-warm, LARGER leaf scale than boxwood */
  var treeH = fbm(256, 4, 4);
  var treeC = rampCanvas(256, treeH, [
    [0, [22, 38, 16]], [0.45, [52, 72, 30]], [0.75, [84, 104, 44]], [1, [116, 132, 58]]]);
  stampLeaves(treeC.getContext("2d"), 256, 620,
    ["#2a4218", "#3e5a24", "#566e2e", "#6e8438", "#86983f"], 3.2, 6.4, 0.8);
  var treeTex  = toTex(treeC, 2, 2, true);
  var treeBump = toTex(bumpCanvas(256, treeH, 0.7), 2, 2, false);

  var marbH = fbm(256, 5, 3);
  var marbC = rampCanvas(256, marbH, [   /* deeper value range — never flat white */
    [0, [198, 189, 170]], [0.45, [224, 217, 202]], [0.8, [240, 235, 224]], [1, [248, 244, 234]]]);
  var marbBumpC = bumpCanvas(256, marbH, 0.35);
  (function veins(cc, bc) {
    var gs = [cc.getContext("2d"), bc.getContext("2d")];
    for (var v = 0; v < 14; v++) {
      var x = random() * 256, y = 0;
      var pts = [[x, y]];
      while (y < 256) {
        x += random() * 20 - 10; y += 8 + random() * 14;
        pts.push([x, y]);
      }
      for (var k = 0; k < 2; k++) {
        var g = gs[k];
        g.strokeStyle = k ? "#6a6a6a" : "#9a927e";
        g.globalAlpha = (k ? 0.25 : 0.14) * (0.5 + random() * 0.5);
        g.lineWidth = 0.6 + random() * 1.3;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (var pI = 1; pI < pts.length; pI++) g.lineTo(pts[pI][0], pts[pI][1]);
        g.stroke();
      }
    }
    gs[0].globalAlpha = gs[1].globalAlpha = 1;
  })(marbC, marbBumpC);
  var marbleTex  = toTex(marbC, 1, 1, true);
  var marbleBump = toTex(marbBumpC, 1, 1, false);

  /* --- ALPHA CARDS: a leafy cluster + a grass tuft --- */
  /* leaf-cluster cards in three tonal families, so canopies get real
     depth: near-black interior, mid greens, sunlit yellow-greens */
  function makeLeafTex(colors, rib) {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    for (var i = 0; i < 34; i++) {
      var ang = random() * Math.PI * 2;
      var rad = Math.pow(random(), 0.7) * 46;
      g.save();
      g.translate(64 + Math.cos(ang) * rad, 64 + Math.sin(ang) * rad);
      g.rotate(random() * Math.PI * 2);
      var L = (7 + random() * 8) * (0.6 + random() * 0.8); // ±40 %
      g.globalAlpha = 0.92;
      g.fillStyle = colors[(random() * colors.length) | 0];
      g.beginPath(); g.ellipse(0, 0, L, L * 0.45, 0, 0, 7); g.fill();
      g.globalAlpha = 0.4; g.strokeStyle = rib; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke();
      g.restore();
    }
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  var leafCardTexes = [
    /* "interior" is muted sage — NEVER near-black (unlit cards render
       their painted colour exactly, so dark paint = black shapes) */
    makeLeafTex(["#2c4630", "#35513a", "#3e5c42", "#476849"], "#5c7a52"),  // interior
    makeLeafTex(["#33582b", "#477038", "#578544", "#4a7036"], "#89b06a"),  // mid
    makeLeafTex(["#5c8a44", "#729e50", "#8fb35c", "#a3bd62"], "#c9d98c")   // sunlit
  ];

  /* big foliage CUTOUT sheets: real leaf silhouettes in clumps with
     ragged transparent gaps — canopies are built from crossed planes
     of these, not from sphere geometry */
  function makeCutoutTex(colors, hi) {
    var c = document.createElement("canvas");
    c.width = c.height = 256;
    var g = c.getContext("2d");
    for (var cl = 0; cl < 11; cl++) {   // leaf clumps, clear margin all
      var cx = 46 + random() * 164, cy = 46 + random() * 164;
      var spread2 = 14 + random() * 20;   // around — no cut leaves
      var nL = 14 + ((random() * 12) | 0);
      for (var i = 0; i < nL; i++) {
        var ang = random() * Math.PI * 2;
        var rr2 = Math.pow(random(), 0.6) * spread2;
        g.save();
        g.translate(cx + Math.cos(ang) * rr2, cy + Math.sin(ang) * rr2);
        g.rotate(random() * Math.PI * 2);
        var L = 5 + random() * 7;
        g.globalAlpha = 0.9 + random() * 0.1;
        g.fillStyle = colors[(random() * colors.length) | 0];
        g.beginPath();                                 // pointed leaf shape
        g.moveTo(0, 0);
        g.quadraticCurveTo(L * 0.5, -L * 0.32, L, 0);
        g.quadraticCurveTo(L * 0.5,  L * 0.32, 0, 0);
        g.closePath(); g.fill();
        if (random() < 0.25) {                    // sunlit flecks
          g.globalAlpha = 0.5;
          g.fillStyle = hi;
          g.beginPath();
          g.ellipse(L * 0.55, 0, L * 0.28, L * 0.12, 0, 0, 7);
          g.fill();
        }
        g.restore();
      }
    }
    g.globalAlpha = 1;
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  var cutoutTexes = [
    makeCutoutTex(["#31503a", "#3a5c42", "#44684a", "#4e7452"], "#648256"), // shade (sage)
    makeCutoutTex(["#2e5226", "#3c6430", "#4c7838", "#5a8840"], "#9cc06a"), // mid
    makeCutoutTex(["#4f7c38", "#649046", "#7aa452", "#8fb45c"], "#d2e096")  // sun
  ];
  /* a flowering species: green base threaded with blush blossoms */
  var blossomTexes = [
    makeCutoutTex(["#4c6a38", "#5c7a42", "#dcaebc", "#e8c6d0"], "#f6e6ea"),
    makeCutoutTex(["#5a7a44", "#e2b8c4", "#eed2da", "#f4e2e6"], "#fdf2f4")
  ];

  /* a cluster of soft blossoms, painted white — per-instance colour
     tints them pink / coral / lavender / red at zero extra cost */
  var flowerTex = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    for (var f = 0; f < 9; f++) {
      var cx = 18 + random() * 92, cy = 18 + random() * 92;
      var R = 5 + random() * 6;
      for (var p = 0; p < 6; p++) {
        var ang = p / 6 * Math.PI * 2 + random() * 0.4;
        g.globalAlpha = 0.85 + random() * 0.15;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.ellipse(cx + Math.cos(ang) * R * 0.55, cy + Math.sin(ang) * R * 0.55,
                  R * 0.52, R * 0.3, ang, 0, 7);
        g.fill();
      }
      g.globalAlpha = 0.9;
      g.fillStyle = "#e8d489";                       // stamen
      g.beginPath(); g.arc(cx, cy, R * 0.22, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  /* villa palette: warm white, blush, coral, deep red, lavender, gold */
  var flowerPalette = [0xf5efe6, 0xe8b4c0, 0xe2907a, 0xa8354f, 0xb7a4d4, 0xe6c86e];

  /* second flower type: larger single blooms with round petals */
  var flowerTex2 = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    for (var f = 0; f < 5; f++) {
      var cx = 24 + random() * 80, cy = 24 + random() * 80;
      var R = 9 + random() * 5;
      for (var p = 0; p < 8; p++) {
        var ang = p / 8 * Math.PI * 2 + random() * 0.2;
        g.globalAlpha = 0.9;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.ellipse(cx + Math.cos(ang) * R * 0.6, cy + Math.sin(ang) * R * 0.6,
                  R * 0.42, R * 0.26, ang, 0, 7);
        g.fill();
      }
      g.globalAlpha = 0.95;
      g.fillStyle = "#e0b24e";
      g.beginPath(); g.arc(cx, cy, R * 0.3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();

  var tuftTex = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d");
    for (var b4 = 0; b4 < 11; b4++) {
      var bx = 12 + random() * 40;
      var tipx = bx + (random() * 28 - 14), tiph = 5 + random() * 20;
      var w = 1.5 + random() * 1.6;
      g.fillStyle = ["#4d7238", "#5d8442", "#3f6130", "#6d9750"][(random() * 4) | 0];
      g.globalAlpha = 0.95;
      g.beginPath();
      g.moveTo(bx - w, 64);
      g.quadraticCurveTo(bx - w * 0.4 + (tipx - bx) * 0.4, 40, tipx, tiph);
      g.quadraticCurveTo(bx + w * 0.4 + (tipx - bx) * 0.4, 40, bx + w, 64);
      g.closePath(); g.fill();
    }
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();

  /* organic silhouettes: push vertices along their normals by noise */
  function displaceNormal(geo, amp, freq) {
    geo.computeVertexNormals();
    var pos = geo.attributes.position, nor = geo.attributes.normal;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var n = Math.sin(x * freq + 1.7) * Math.sin(y * freq * 1.31 + 4.2) *
              Math.sin(z * freq * 0.77 + 2.1) +
              0.5 * Math.sin(x * freq * 2.3 + 0.4) * Math.sin(z * freq * 2.9 + 1.2);
      var d = amp * n;
      pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------- 4 · Sky dome & clouds ---------- */
  var skyTex = (function () {
    var c = document.createElement("canvas");
    c.width = 16; c.height = 512;
    var g = c.getContext("2d");
    var grad = g.createLinearGradient(0, 0, 0, 512);
    /* Slate zenith transitions to a muted warm horizon. */
    grad.addColorStop(0.0, "#263d51");     // slate zenith
    grad.addColorStop(0.28, "#536e7c");
    grad.addColorStop(0.46, "#7d9296");    // cool mid-sky
    grad.addColorStop(0.6, "#a2aaa0");     // visible horizon transition
    grad.addColorStop(0.78, "#c2baa0");
    grad.addColorStop(1.0, "#dad0af");     // cream at the horizon
    g.fillStyle = grad; g.fillRect(0, 0, 16, 512);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  })();
  /* A softly graded dome keeps the portfolio legible throughout the orbit. */
  var skyDomeMat = new THREE.MeshBasicMaterial({
    map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false });
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 20), skyDomeMat));

  /* --- the sun: hot core + wide warm bloom, high and off-centre --- */
  (function sunDisc() {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0.0, "rgba(255,253,244,0.98)");
    grad.addColorStop(0.18, "rgba(255,243,207,0.85)");
    grad.addColorStop(0.5, "rgba(255,236,190,0.22)");
    grad.addColorStop(1.0, "rgba(255,236,190,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    var dir = new THREE.Vector3(-12, 22, 10).normalize();
    var core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, fog: false, depthWrite: false }));
    core.position.copy(dir.clone().multiplyScalar(132));
    core.scale.set(20, 20, 1);
    scene.add(core);
    var bloom = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, fog: false, depthWrite: false, opacity: 0.22 }));
    bloom.position.copy(dir.clone().multiplyScalar(128));
    bloom.scale.set(55, 55, 1);
    scene.add(bloom);
  })();

  /* --- volumetric cumulus: clusters of lit-top / shaded-base puffs,
         drifting at depth-dependent speeds (parallax) --- */
  var cloudClusters = [];
  (function clouds() {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    /* shaded body: cool blue-grey */
    var body = g.createRadialGradient(64, 74, 6, 64, 74, 58);
    body.addColorStop(0, "rgba(208,218,234,0.85)");
    body.addColorStop(0.6, "rgba(196,208,228,0.5)");
    body.addColorStop(1, "rgba(196,208,228,0)");
    g.fillStyle = body; g.fillRect(0, 0, 128, 128);
    /* sunlit crown: warm white, offset toward the sun */
    var crown = g.createRadialGradient(56, 46, 4, 56, 46, 46);
    crown.addColorStop(0, "rgba(255,253,246,0.95)");
    crown.addColorStop(0.55, "rgba(255,250,238,0.5)");
    crown.addColorStop(1, "rgba(255,250,238,0)");
    g.fillStyle = crown; g.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;

    for (var i = 0; i < 7; i++) {
      var grp = new THREE.Group();
      var depth = 0.55 + random();                 // near … far
      var rad = 58 + depth * 45;
      var az = random() * Math.PI * 2;
      var h = 30 + random() * 26;
      var w0 = 16 + random() * 18;
      var puffs = 3 + ((random() * 3) | 0);
      for (var p = 0; p < puffs; p++) {
        var s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true, fog: false, depthWrite: false,
          opacity: 0.45 + random() * 0.35 }));
        s.position.set((random() - 0.5) * w0 * 1.4,
                       (random() - 0.4) * w0 * 0.3, 0);
        var w = w0 * (0.5 + random() * 0.6);
        s.scale.set(w, w * (0.42 + random() * 0.18), 1);
        grp.add(s);
      }
      grp.position.set(Math.sin(az) * rad, h, Math.cos(az) * rad);
      scene.add(grp);
      /* nearer clouds drift faster → parallax between layers */
      cloudClusters.push({ grp: grp, az: az, rad: rad, h: h,
                           speed: (0.010 + random() * 0.008) / depth });
    }
  })();
  function driftClouds(dt) {
    for (var i = 0; i < cloudClusters.length; i++) {
      var cl = cloudClusters[i];
      cl.az += cl.speed * dt;
      cl.grp.position.set(Math.sin(cl.az) * cl.rad, cl.h, Math.cos(cl.az) * cl.rad);
    }
  }

  /* ---------- 5 · Dusk environment and static sunlight shadows ---------- */
  var hemiLight = new THREE.HemisphereLight(0xdfe8ee, 0x8a9877, 0.9);
  scene.add(hemiLight);
  var fillLight = new THREE.AmbientLight(0xf2ede2, 0.34);
  scene.add(fillLight);

  var sun = new THREE.DirectionalLight(0xffeecd, 1.0);
  sun.position.set(-12, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(smallScreen.matches ? 1024 : 2048,
                         smallScreen.matches ? 1024 : 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
  sun.shadow.camera.right = sun.shadow.camera.top = 30;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  /* ---------- 6 · Materials (all with bump detail) ---------- */
  var grassMat = new THREE.MeshStandardMaterial({
    map: grassTex, bumpMap: grassBump, bumpScale: 0.05, roughness: 1 });
  var gravelMat = new THREE.MeshStandardMaterial({
    map: gravelTex, bumpMap: gravelBump, bumpScale: 0.035, roughness: 1 });
  /* FOUR distinct vegetation materials — different hue, value, leaf
     scale, bumpiness. All fully matte: foliage is not plastic. */
  /* soft emissive lift on all foliage: nothing ever reads as a
     hard black lump — edges glow faintly with sky light */
  var hedgeMat = new THREE.MeshStandardMaterial({
    map: hedgeTex, bumpMap: hedgeBump, bumpScale: 0.09,
    roughness: 1.0, metalness: 0, emissive: 0x020401 });
  var cypressMat = new THREE.MeshStandardMaterial({
    map: cypressTex, bumpMap: cypressBump, bumpScale: 0.06,
    roughness: 1.0, metalness: 0, emissive: 0x010301 });
  var treeMat = new THREE.MeshStandardMaterial({
    map: treeTex, bumpMap: treeBump, bumpScale: 0.11,
    roughness: 1.0, metalness: 0, emissive: 0x020401 });
  var stoneMat = new THREE.MeshStandardMaterial({
    map: stoneTex, normalMap: stoneNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: stoneRough, roughness: 1.0 });
  var mortarMat = new THREE.MeshStandardMaterial({
    color: 0x99896a, roughness: 1, side: THREE.BackSide });
  var stoneCapMat = new THREE.MeshStandardMaterial({ color: 0xafa183, roughness: 1 });
  /* marble is physical: clearcoat sheen + veined bump + env reflections */
  var marbleMat = new THREE.MeshPhysicalMaterial({
    map: marbleTex, bumpMap: marbleBump, bumpScale: 0.012,
    roughness: 0.5, metalness: 0.0,
    clearcoat: 0.15, clearcoatRoughness: 0.5,
    emissive: 0x000000 });
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 1 });
  /* leaf cards are UNLIT: their tones are painted into the textures,
     so front and back faces render identically — no dark flipped
     planes, no 2D lighting facets, and fog still applies.
     polygonOffset pulls them off nearby surfaces (never z-fights). */
  var leafCardMats = leafCardTexes.map(function (t) {
    return new THREE.MeshBasicMaterial({
      map: t, alphaTest: 0.45, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  });
  function pickLeafMat() {           // mostly mid-tone, some shade, some sunlit
    var r = random();
    return leafCardMats[r < 0.18 ? 0 : r < 0.68 ? 1 : 2];
  }
  var tuftMat = new THREE.MeshStandardMaterial({
    map: tuftTex, alphaTest: 0.4, side: THREE.DoubleSide,
    roughness: 1.0, metalness: 0 });
  var flowerMat = new THREE.MeshStandardMaterial({
    map: flowerTex, alphaTest: 0.4, side: THREE.DoubleSide,
    roughness: 1.0, metalness: 0,
    /* gently luminous — blooms twinkle softly through the haze */
    emissive: 0x000000, emissiveIntensity: 0 });
  var flowerMat2 = new THREE.MeshStandardMaterial({
    map: flowerTex2, alphaTest: 0.4, side: THREE.DoubleSide,
    roughness: 1.0, metalness: 0,
    emissive: 0x000000, emissiveIntensity: 0 });
  var flowerMats = flowerPalette.map(function (hex) {
    var m = flowerMat.clone();
    m.color.setHex(hex);
    return m;
  });
  /* canopy tonal variants: interior-dark and sunlit-warm */
  var canopyDarkMat = treeMat.clone();
  canopyDarkMat.color.setHex(0x9aa38f);              // sage interior, never black
  var canopyLightMat = treeMat.clone();
  canopyLightMat.color.setHex(0xecebcc);             // pale-gold sunlit tops

  /* soft environment reflections for the marble (sky + lawn) */
  try {
    var pmrem = new THREE.PMREMGenerator(renderer);
    var envScene = new THREE.Scene();
    /* the same pastel sky becomes the marble's reflection environment */
    envScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
    var envGround = new THREE.Mesh(
      new THREE.CircleGeometry(50, 24),
      new THREE.MeshBasicMaterial({ color: 0x5d7a45 }));
    envGround.rotation.x = -Math.PI / 2;
    envGround.position.y = -2;
    envScene.add(envGround);
    var envRT = pmrem.fromScene(envScene, 0.04);
    marbleMat.envMap = envRT.texture;
    marbleMat.envMapIntensity = 0.55;
    pmrem.dispose();
  } catch (e) { /* render-to-texture unavailable — marble still fine */ }


  var leafRecords = [];
  var windTime = { value: 0 };
  var leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0,0,.07, 0,-.5,0, -.16,-.25,.01, -.24,0,0, -.16,.27,-.02,
    0,.5,.03, .16,.27,-.02, .24,0,0, .16,-.25,.01
  ],3));
  leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    .5,.5, .5,0, .17,.25, 0,.5, .17,.77, .5,1, .83,.77, 1,.5, .83,.25
  ],2));
  leafGeometry.setIndex([0,1,2,0,2,3,0,3,4,0,4,5,0,5,6,0,6,7,0,7,8,0,8,1]);
  leafGeometry.computeVertexNormals();
  var livingLeafMat = new THREE.MeshStandardMaterial({
    color:0xffffff, side:THREE.DoubleSide, roughness:.78, metalness:0
  });
  livingLeafMat.onBeforeCompile = function(shader) {
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;\n' +
      'transformed.x += sin(uWindTime * 1.15 + phase) * 0.07 * (position.y + 0.5);');
  };
  function plantLeaf(parent, x,y,z, size, hue, light, slender) {
    var obj = new THREE.Object3D();
    obj.position.set(x,y,z);
    obj.rotation.set(random()*Math.PI,random()*Math.PI*2,random()*Math.PI);
    obj.scale.set(size*(slender || 1),size,size);
    obj.updateMatrix();
    leafRecords.push({parent:parent,matrix:obj.matrix.clone(),
      color:new THREE.Color().setHSL(hue, .28+random()*.24,light)});
  }
  function leafShell(parent, radius, count, hue, size) {
    count = Math.floor(count * (smallScreen.matches ? .42 : 1));
    for(var i=0;i<count;i++) {
      var y=random()*2-1, a=random()*Math.PI*2, r=radius*Math.cbrt(.15+random()*.85);
      var ring=Math.sqrt(1-y*y);
      plantLeaf(parent,Math.cos(a)*ring*r,y*r,Math.sin(a)*ring*r,
        size*(.7+random()*.7),hue+random()*.025,.075+random()*.09);
    }
  }
  function bakeLeaves() {
    scene.updateMatrixWorld(true);
    // Spatial batches allow Three.js to cull trees behind the camera.
    var tiles=new Map(), world=new THREE.Matrix4(), position=new THREE.Vector3();
    leafRecords.forEach(function(leaf) {
      world.multiplyMatrices(leaf.parent.matrixWorld,leaf.matrix);
      position.setFromMatrixPosition(world);
      var key=Math.floor(position.x/8)+','+Math.floor(position.z/8);
      if(!tiles.has(key)) tiles.set(key,[]);
      tiles.get(key).push({matrix:world.clone(),color:leaf.color});
    });
    tiles.forEach(function(leaves) {
      var geometry=leafGeometry.clone();
      var mesh=new THREE.InstancedMesh(geometry,livingLeafMat,leaves.length);
      var bounds=new THREE.Box3(), point=new THREE.Vector3();
      leaves.forEach(function(leaf,i) {
        mesh.setMatrixAt(i,leaf.matrix); mesh.setColorAt(i,leaf.color);
        point.setFromMatrixPosition(leaf.matrix); bounds.expandByPoint(point);
      });
      bounds.expandByScalar(1.5);
      geometry.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
      mesh.castShadow=mesh.receiveShadow=true;
      mesh.frustumCulled=true;
      mesh.instanceMatrix.needsUpdate=true;
      scene.add(mesh);
    });
    leafRecords=[];
  }

  /* ---------- 7 · Ground, paths, parterre ---------- */
  var ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* gravel circle around the statue + four radial walks */
  var plaza = new THREE.Mesh(new THREE.CircleGeometry(4.4, 40), gravelMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  for (var pi = 0; pi < 4; pi++) {
    var walk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 21), gravelMat);
    walk.rotation.x = -Math.PI / 2;
    walk.rotation.z = pi * Math.PI / 2;
    /* slide each walk outward so it starts at the plaza edge */
    walk.position.set(Math.sin(pi * Math.PI / 2) * 13.5, 0.02,
                      Math.cos(pi * Math.PI / 2) * 13.5);
    walk.receiveShadow = true;
    scene.add(walk);
  }

  /* clipped boxwood arcs — two concentric parterre rings, with
     gaps aligned to the four walks. A torus with noise-displaced
     vertices reads as a clipped-but-alive hedge. */
  function hedgeArc(radius, tube, arcLen, azimuth, squash) {
    /* hand-clipped but formal: fine lumps, never boulders */
    var geo = displaceNormal(
      new THREE.TorusGeometry(radius, tube, 14, 64, arcLen), tube * 0.1, 3.4);
    var m = new THREE.Mesh(geo, hedgeMat);
    m.rotation.x = -Math.PI / 2;          // lay flat
    m.rotation.z = azimuth;               // spin into place
    m.position.y = tube * squash;         // sit on the ground
    m.scale.set(1, 1, squash);            // clip the top flat-ish
    m.castShadow = m.receiveShadow = true;
    /* SOLID ends: a torus arc is an open pipe — cap both cut ends
       with displaced spheres (children inherit the squash) so the
       hedge can never be seen into from an oblique angle */
    for (var e = 0; e < 2; e++) {
      var ang = e ? arcLen : 0;
      var capBall = new THREE.Mesh(
        displaceNormal(new THREE.SphereGeometry(tube * 0.99, 14, 10), tube * 0.1, 5),
        hedgeMat);
      capBall.position.set(Math.cos(ang) * radius, Math.sin(ang) * radius, 0);
      capBall.castShadow = capBall.receiveShadow = true;
      m.add(capBall);
    }
    var count = smallScreen.matches ? 1600 : 4300;
    for(var li=0;li<count;li++) {
      var a=random()*arcLen, t=random()*Math.PI*2, r=radius+Math.cos(t)*tube;
      plantLeaf(m,Math.cos(a)*r,Math.sin(a)*r,Math.sin(t)*tube,
        .09+random()*.06,.24,.07+random()*.10);
    }
    scene.add(m);
  }
  /* knee-height formal parterre. Gaps are CENTRED on the four walks
     at both radii, so hedges never clip into the gravel. */
  var GAP_IN = 0.46, GAP_OUT = 0.30;
  for (var q = 0; q < 4; q++) {
    hedgeArc(7.2, 0.5, Math.PI / 2 - GAP_IN,
             q * Math.PI / 2 + GAP_IN / 2, 0.75);
    hedgeArc(13.8, 0.55, Math.PI / 2 - GAP_OUT,
             q * Math.PI / 2 + GAP_OUT / 2, 0.7);
  }

  /* boxwood spheres flanking each walk where it meets the plaza */
  for (var b = 0; b < 4; b++) {
    var wAz = b * Math.PI / 2;
    for (var side = -1; side <= 1; side += 2) {
      /* topiary spheres: smaller than any tree, larger than flowers */
      var ball = new THREE.Mesh(
        displaceNormal(new THREE.SphereGeometry(0.6, 24, 18), 0.04, 7), hedgeMat);
      var off = wAz + side * 0.32;
      ball.position.set(Math.sin(off) * 5.6, 0.52, Math.cos(off) * 5.6);
      ball.castShadow = ball.receiveShadow = true;
      leafShell(ball,.63,1000,.24,.12);
      scene.add(ball);
    }
  }

  /* merge two geometries into one (crossed-plane "solid" billboards) */
  function mergeGeos(a, b) {
    var out = new THREE.BufferGeometry();
    ["position", "normal", "uv"].forEach(function (name) {
      var A = a.attributes[name], B = b.attributes[name];
      var arr = new Float32Array(A.array.length + B.array.length);
      arr.set(A.array, 0); arr.set(B.array, A.array.length);
      out.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize));
    });
    var ia = a.index.array, ib = b.index.array, off = a.attributes.position.count;
    var idx = new Uint16Array(ia.length + ib.length);
    idx.set(ia, 0);
    for (var i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + off;
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  /* thousands of individual grass blades (instanced, alpha-tested) —
     the single biggest realism win for the lawn */
  (function grassBlades() {
    var n=smallScreen.matches ? 6500 : 18000;
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute([-.014,0,0,.014,0,0,.025,.14,.022],3));
    geo.computeVertexNormals();
    var mat=new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide,roughness:1});
    var mesh=new THREE.InstancedMesh(geo,mat,n), dummy=new THREE.Object3D();
    var col=new THREE.Color(), placed=0;
    while(placed<n) {
      var a=random()*Math.PI*2, r=5+random()*19;
      var x=Math.sin(a)*r,z=Math.cos(a)*r;
      if(Math.abs(x)<1.3 || Math.abs(z)<1.3) continue;
      dummy.position.set(x,.006,z); dummy.rotation.y=random()*Math.PI*2;
      dummy.scale.setScalar(.35+random()*.65); dummy.updateMatrix();
      mesh.setMatrixAt(placed,dummy.matrix);
      col.setHSL(.22+random()*.05,.3,.08+random()*.10); mesh.setColorAt(placed,col);
      placed++;
    }
    mesh.receiveShadow=true; scene.add(mesh);
  })();

  /* ---------- 7b · Flowers: a broderie parterre in bloom ---------- */
  (function flowerBeds() {
    var N = smallScreen.matches ? 280 : 760;
    var fA = new THREE.PlaneGeometry(0.42, 0.34);
    fA.translate(0, 0.17, 0);
    var fB = fA.clone();
    fB.rotateY(Math.PI / 2);
    var beds = new THREE.InstancedMesh(normalsUp(mergeGeos(fA, fB)), flowerMat, N);
    var m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(),
        eu = new THREE.Euler(), sc = new THREE.Vector3(),
        pp = new THREE.Vector3(), col = new THREE.Color();
    /* beds hug both faces of each parterre ring — never a grid */
    var bands = [[6.35, 6.65], [7.75, 8.1], [12.95, 13.25], [14.35, 14.7]];
    var placed = 0, guard = 0;
    while (placed < N && guard++ < N * 40) {
      var band = bands[(random() * bands.length) | 0];
      var rr = band[0] + random() * (band[1] - band[0]);
      var a = random() * Math.PI * 2;
      var x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      if (Math.abs(x) < 1.7 || Math.abs(z) < 1.7) continue;   // clear the walks
      var s = 0.85 + random() * 0.65;
      eu.set(0, random() * Math.PI, (random() - 0.5) * 0.2);
      qt.setFromEuler(eu);
      sc.set(s, s, s);
      pp.set(x, 0, z);
      m4.compose(pp, qt, sc);
      beds.setMatrixAt(placed, m4);
      col.setHex(flowerPalette[(random() * flowerPalette.length) | 0]);
      col.offsetHSL(0, 0, (random() - 0.5) * 0.08);      // subtle variety
      beds.setColorAt(placed, col);
      placed++;
    }
    beds.count = placed;
    beds.instanceMatrix.needsUpdate = true;
    if (beds.instanceColor) beds.instanceColor.needsUpdate = true;
    beds.receiveShadow = true;
    beds.castShadow = true;
    scene.add(beds);

    /* second species: fewer, larger single blooms, same bands */
    var N2 = (N * 0.45) | 0;
    var f2A = new THREE.PlaneGeometry(0.5, 0.4);
    f2A.translate(0, 0.2, 0);
    var f2B = f2A.clone();
    f2B.rotateY(Math.PI / 2);
    var beds2 = new THREE.InstancedMesh(normalsUp(mergeGeos(f2A, f2B)), flowerMat2, N2);
    var placed2 = 0, guard2 = 0;
    while (placed2 < N2 && guard2++ < N2 * 40) {
      var band2 = bands[(random() * bands.length) | 0];
      var rr2 = band2[0] + random() * (band2[1] - band2[0]);
      var a2 = random() * Math.PI * 2;
      var x2 = Math.sin(a2) * rr2, z2 = Math.cos(a2) * rr2;
      if (Math.abs(x2) < 1.7 || Math.abs(z2) < 1.7) continue;
      var s2 = 0.9 + random() * 0.6;
      eu.set(0, random() * Math.PI, (random() - 0.5) * 0.2);
      qt.setFromEuler(eu);
      sc.set(s2, s2, s2);
      pp.set(x2, 0, z2);
      m4.compose(pp, qt, sc);
      beds2.setMatrixAt(placed2, m4);
      col.setHex(flowerPalette[(random() * flowerPalette.length) | 0]);
      beds2.setColorAt(placed2, col);
      placed2++;
    }
    beds2.count = placed2;
    beds2.instanceMatrix.needsUpdate = true;
    if (beds2.instanceColor) beds2.instanceColor.needsUpdate = true;
    beds2.receiveShadow = true;
    beds2.castShadow = true;
    scene.add(beds2);

    /* a few loose petals drifted onto lawn and gravel */
    var P = smallScreen.matches ? 30 : 70;
    var petalGeo = new THREE.PlaneGeometry(0.1, 0.065);
    var petalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 });
    var petals = new THREE.InstancedMesh(petalGeo, petalMat, P);
    for (var pI = 0; pI < P; pI++) {
      var pa = random() * Math.PI * 2;
      var prr = 5.2 + random() * 11.5;   // outside the plinth ring
      pp.set(Math.sin(pa) * prr, 0.06, Math.cos(pa) * prr);
      eu.set(-Math.PI / 2 + (random() - 0.5) * 0.5,
             0, random() * Math.PI * 2);
      qt.setFromEuler(eu);
      var ps = 0.7 + random() * 0.7;
      sc.set(ps, ps, ps);
      m4.compose(pp, qt, sc);
      petals.setMatrixAt(pI, m4);
      col.setHex(flowerPalette[1 + ((random() * 4) | 0)]);
      petals.setColorAt(pI, col);
    }
    petals.instanceMatrix.needsUpdate = true;
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    scene.add(petals);
  })();

  /* billboard-lighting fix: foliage planes must NOT shade like flat
     cards. Bend all their normals to point UP so every leaf plane
     receives the same soft sky lighting — no 2D facets, no flipping. */
  function normalsUp(geo) {
    var n = geo.attributes.normal;
    for (var i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return geo;
  }

  /* ---------- 8 · Cypresses ---------- */
  var cardGeo = normalsUp(new THREE.PlaneGeometry(1, 1)); // shared foliage card

  /* classic flame profile via lathe, roughed up by displacement */
  var cypressProfile = [
    [0.00, 0.0], [0.42, 0.35], [0.62, 1.1], [0.72, 2.2], [0.66, 3.4],
    [0.52, 4.6], [0.34, 5.7], [0.18, 6.5], [0.05, 7.1], [0.0, 7.4]
  ];
  var cypressGeo = (function () {
    var pts = [];
    for (var i = 0; i < cypressProfile.length; i++)
      pts.push(new THREE.Vector2(cypressProfile[i][0], cypressProfile[i][1]));
    /* stronger displacement = faintly wavering, feathery edge */
    return displaceNormal(new THREE.LatheGeometry(pts, 22), 0.08, 2.6);
  })();

  function cypress(az, radius, scale) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(cypressGeo, cypressMat);
    body.castShadow = true;
    body.position.y = 0.5;
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 8), trunkMat);
    trunk.position.y = 0.3;
    trunk.castShadow = true;
    g.add(trunk); g.add(body);
    body.scale.set(.68,1,.68);
    var n = smallScreen.matches ? 2200 : 5200;
    for(var cI=0;cI<n;cI++) {
      var seg=.35+random()*(cypressProfile.length-1.36), i0=seg|0, f=seg-i0;
      var py=THREE.MathUtils.lerp(cypressProfile[i0][1],cypressProfile[i0+1][1],f)+.5;
      var pr=THREE.MathUtils.lerp(cypressProfile[i0][0],cypressProfile[i0+1][0],f);
      var a=random()*Math.PI*2;
      pr *= .6+random()*.55 + .12*Math.sin(py*13+a*5);
      plantLeaf(g,Math.sin(a)*pr,py,Math.cos(a)*pr,.12+random()*.11,.28,.045+random()*.095,.5);
    }
    g.position.set(Math.sin(az) * radius, 0, Math.cos(az) * radius);
    g.scale.setScalar(scale);
    g.rotation.y = random() * Math.PI;
    scene.add(g);
  }

  /* outer sentinel ring — always behind the camera's orbit (r ≥ 20) */
  for (var ci = 0; ci < 11; ci++) {
    var az = (ci / 11) * Math.PI * 2 + 0.13;
    cypress(az, 20 + random() * 2.5, 0.85 + random() * 0.4);
  }
  /* two inner accents, placed at azimuths the camera never occupies */
  cypress(THREE.MathUtils.degToRad(252), 12.8, 1.05);
  cypress(THREE.MathUtils.degToRad(288), 13.4, 0.9);

  /* ---------- 9 · Continuous, coursed sandstone wall ----------
     All blocks share the same curved inner face, thickness and height.
     Alternate courses are offset by half a brick; only colour varies. */
  var WALL_INNER = 25.72, WALL_OUTER = 26.38;
  var wall = new THREE.Group();
  wall.name = 'garden-wall';
  scene.add(wall);

  function wallSector(inner, outer, height, arc, segments) {
    var positions = [], uvs = [], indices = [];
    function point(radius, angle, y) {
      return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
    }
    function quad(a, b, c, d, width, h, uOffset) {
      var start = positions.length / 3;
      positions.push.apply(positions, a.concat(b, c, d));
      var u = uOffset || 0;
      uvs.push(u, 0, u, h, u + width, h, u + width, 0);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    var bottom = -height / 2, top = height / 2;
    for (var i = 0; i < segments; i++) {
      var a = -arc / 2 + arc * i / segments;
      var b = -arc / 2 + arc * (i + 1) / segments;
      var ibA = point(inner, a, bottom), itA = point(inner, a, top);
      var ibB = point(inner, b, bottom), itB = point(inner, b, top);
      var obA = point(outer, a, bottom), otA = point(outer, a, top);
      var obB = point(outer, b, bottom), otB = point(outer, b, top);
      var width = inner * (b - a);
      quad(ibA, itA, itB, ibB, width, height, i * width); // inward-facing stone
      quad(obB, otB, otA, obA, width, height, i * width); // exterior
      quad(itA, otA, otB, itB, outer - inner, width); // top
      quad(ibB, obB, obA, ibA, outer - inner, width); // bottom
    }
    var first = -arc / 2, last = arc / 2;
    quad(point(outer, first, bottom), point(outer, first, top),
         point(inner, first, top), point(inner, first, bottom), outer - inner, height);
    quad(point(inner, last, bottom), point(inner, last, top),
         point(outer, last, top), point(outer, last, bottom), outer - inner, height);
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  var mortar = new THREE.Mesh(
    new THREE.CylinderGeometry(25.80, 25.80, 4.35, 352, 1, true), mortarMat);
  mortar.name = 'wall-mortar';
  mortar.position.y = 2.175;
  mortar.receiveShadow = true;
  wall.add(mortar);

  var footing = new THREE.Mesh(
    wallSector(25.65, 26.42, .35, Math.PI * 2, 352), stoneCapMat);
  footing.name = 'wall-footing';
  footing.position.y = .175;
  footing.receiveShadow = footing.castShadow = true;
  wall.add(footing);

  var wallColumns = 88, wallRows = 8, rowPitch = .5, mortarGap = .025;
  var anglePitch = Math.PI * 2 / wallColumns;
  var blockGeo = wallSector(WALL_INNER, WALL_OUTER,
    rowPitch - mortarGap, anglePitch - mortarGap / WALL_INNER, 4);
  var blocks = new THREE.InstancedMesh(blockGeo, stoneMat, wallColumns * wallRows);
  blocks.name = 'wall-bricks';
  // The geometry is a sector centred at the origin; all instances rotate
  // around the garden. Disable the old Three.js instance bounds shortcut.
  blocks.frustumCulled = false;
  var blockTransform = new THREE.Object3D(), blockColor = new THREE.Color();
  for (var row = 0; row < wallRows; row++) {
    for (var column = 0; column < wallColumns; column++) {
      blockTransform.position.set(0, .35 + (row + .5) * rowPitch, 0);
      blockTransform.rotation.set(0, (column + (row % 2) * .5) * anglePitch, 0);
      blockTransform.updateMatrix();
      var index = row * wallColumns + column;
      blocks.setMatrixAt(index, blockTransform.matrix);
      var tone = .91 + random() * .09;
      blockColor.setRGB(tone, tone * .98, tone * .94);
      blocks.setColorAt(index, blockColor);
    }
  }
  blocks.castShadow = blocks.receiveShadow = true;
  wall.add(blocks);

  var cap = new THREE.Mesh(
    wallSector(25.60, 26.46, .22, Math.PI * 2, 352), stoneCapMat);
  cap.name = 'wall-coping';
  cap.position.y = 4.46;
  cap.castShadow = cap.receiveShadow = true;
  wall.add(cap);

  /* foliage cluster, billboard-first: a small dark occluder core,
     wrapped in THREE large crossed leaf-CUTOUT planes (ragged
     silhouette, sky punches through the gaps) plus smaller leaf
     cards. No visible sphere geometry anywhere in a canopy. */
  /* TRUE billboards: SpriteMaterial always faces the camera, so a
     canopy can never be seen edge-on or lie flat against the wall.
     Pre-rotated variants avoid per-sprite material clones. */
  function makeSpriteSet(texes) {
    var out = [];
    texes.forEach(function (t) {
      for (var r = 0; r < 3; r++) {
        out.push(new THREE.SpriteMaterial({
          map: t, alphaTest: 0.4, transparent: true, depthWrite: true,
          rotation: r * 2.1 }));
      }
    });
    return out;
  }
  /* canopy sprites use only the mid + sunlit tones; the shade tone
     is reserved for the small edge cards */
  var canopySprites  = makeSpriteSet([cutoutTexes[1], cutoutTexes[2]]);
  var blossomSprites = makeSpriteSet(blossomTexes);

  function foliageBall(radius, cards, mat, spriteSet) {
    var grp = new THREE.Group();
    leafShell(grp,radius,Math.max(180, radius*radius*500),.24,
      Math.max(.11, radius*.21));

    return grp;
  }

  // Wall faces stay clear: greenery is rooted in pots or supported by trees.
  // Random ivy/flower cards and detached moss lumps have been removed.

  /* terracotta pots with blooms, spaced along the foot of the wall */
  (function pots() {
    var potMat = new THREE.MeshStandardMaterial({ color: 0xb46a42, roughness: 0.95 });
    for (var i = 0; i < 12; i++) {
      var pAz = i / 12 * Math.PI * 2 + 0.26;
      var grp = new THREE.Group();
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 12), potMat);
      pot.position.y = 0.25;
      pot.castShadow = true;
      grp.add(pot);
      var rim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.1, 12), potMat);
      rim.position.y = 0.48;
      grp.add(rim);
      /* bush sits clear ABOVE the rim — no clipping terracotta */
      var bush = foliageBall(0.36, 4, hedgeMat);
      bush.position.y = 0.88;
      grp.add(bush);
      var nB = 4 + ((random() * 3) | 0);
      for (var f3 = 0; f3 < nB; f3++) {
        var bl = new THREE.Mesh(cardGeo,
          flowerMats[(random() * flowerMats.length) | 0]);
        var ba = random() * Math.PI * 2;
        bl.position.set(Math.cos(ba) * 0.26, 0.92 + random() * 0.26,
                        Math.sin(ba) * 0.26);
        bl.rotation.set(random() * Math.PI, random() * Math.PI,
                        random() * Math.PI);
        var bls = 0.26 + random() * 0.18;
        bl.scale.set(bls, bls, bls);
        grp.add(bl);
      }
      grp.position.set(Math.sin(pAz) * 24.1, 0, Math.cos(pAz) * 24.1);
      scene.add(grp);
    }
  })();

  /* umbrella pines & cedars looming beyond the wall */
  /* trees with real topology: trunk → primary branches → secondary
     branches → foliage clusters ATTACHED ALONG the branches. Every
     branch starts where its parent ends; nothing juts loose. */
  function limb(parent, origin, dir, len, r0, r1) {
    var geo = new THREE.CylinderGeometry(r1, r0, len, 6);
    geo.translate(0, len / 2, 0);                 // pivot at the base
    var m = new THREE.Mesh(geo, trunkMat);
    m.position.copy(origin);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    m.castShadow = true;
    parent.add(m);
    return origin.clone().add(dir.clone().normalize().multiplyScalar(len));
  }

  /* Taller branch-and-leaf crowns behind the wall. */
  function pine(height, spread) {
    return tree(height, spread);
  }


  function tree(height, spread, spriteSet) {
    var grp = new THREE.Group();
    var cardN = smallScreen.matches ? 7 : 12;
    /* trunk with a slight lean, splitting at ~55 % height */
    var lean = new THREE.Vector3((random() - 0.5) * 0.25, 1,
                                 (random() - 0.5) * 0.25);
    var crotch = limb(grp, new THREE.Vector3(0, 0, 0), lean,
                      height * 0.55, 0.14 * spread, 0.09 * spread);
    var nPrim = 4 + ((random() * 2) | 0);
    for (var i = 0; i < nPrim; i++) {
      var ang = (i / nPrim) * Math.PI * 2 + random() * 0.8;
      var dir1 = new THREE.Vector3(Math.cos(ang) * (0.7 + random() * 0.5),
                                   1.0 + random() * 0.6,
                                   Math.sin(ang) * (0.7 + random() * 0.5));
      var len1 = height * (0.28 + random() * 0.14);
      var tip1 = limb(grp, crotch, dir1, len1, 0.07 * spread, 0.035 * spread);
      /* cluster at the primary tip — random tone / squash / size */
      var mat1 = tip1.y > height * 0.82 && random() < 0.6 ?
                 canopyLightMat : (random() < 0.6 ? treeMat : canopyDarkMat);
      var cl1 = foliageBall(spread * (0.46 + random() * 0.28), cardN, mat1, spriteSet);
      cl1.position.copy(tip1);
      cl1.scale.y = 0.7 + random() * 0.25;
      cl1.rotation.y = random() * Math.PI * 2;
      grp.add(cl1);
      /* connective mass part-way along the branch — canopies read as
         one continuous crown, never scattered shreds */
      var clMid = foliageBall(spread * (0.3 + random() * 0.15),
                              Math.max(4, cardN - 6), treeMat, spriteSet);
      clMid.position.copy(crotch.clone().lerp(tip1, 0.55));
      grp.add(clMid);
      /* one secondary branch part-way along the primary */
      var mid1 = crotch.clone().lerp(tip1, 0.45 + random() * 0.25);
      var dir2 = dir1.clone();
      dir2.x += (random() - 0.5) * 1.6;
      dir2.z += (random() - 0.5) * 1.6;
      var tip2 = limb(grp, mid1, dir2, len1 * 0.55,
                      0.035 * spread, 0.018 * spread);
      var cl2 = foliageBall(spread * (0.28 + random() * 0.18),
                            Math.max(4, cardN - 5),
                            random() < 0.5 ? treeMat : canopyLightMat,
                            spriteSet);
      cl2.position.copy(tip2);
      cl2.scale.y = 0.7 + random() * 0.25;
      grp.add(cl2);
    }
    /* dark interior heart, tucked at the crown split */
    var mid = foliageBall(spread * 0.52, 5, canopyDarkMat, spriteSet);
    mid.position.copy(crotch).y += spread * 0.25;
    grp.add(mid);
    return grp;
  }

  /* layered depth with FOUR species (round / pine / blossom / the
     cypress ring). Far trees are pushed out with spreads capped so
     NO canopy can ever reach through the wall (r ≥ 33.5, half-width
     ≤ ~3 → nearest leaf ≥ 28 > wall face at 26.35). */
  for (var ti = 0; ti < 16; ti++) {
    var tAz = (ti / 16) * Math.PI * 2 + 0.4;
    var tr = 33.5 + random() * 5.5;
    var t;
    if (ti % 5 === 0) {
      t = pine(8 + random() * 2, 2.6 + random() * 0.6);
    } else if (ti % 7 === 3) {
      t = tree(6.5 + random() * 1.4, 2.6 + random() * 0.5, blossomSprites);
    } else {
      t = tree(6.5 + random() * 1.6, 2.6 + random() * 0.6);
    }
    t.position.set(Math.sin(tAz) * tr, 0, Math.cos(tAz) * tr);
    t.rotation.y = random() * Math.PI * 2;
    scene.add(t);
  }
  /* Keep the complete foreground crown inside the wall and clear of
     the outer camera orbit. Include generated leaves in the bounds. */
  [[1.9, 0], [3.6, 1], [5.4, 0]].forEach(function (fa) {
    var leafStart = leafRecords.length;
    var t = fa[1]
      ? tree(5.4 + random() * 1, 2.1 + random() * .4, blossomSprites)
      : tree(5.4 + random() * 1.2, 2.2 + random() * .5);
    t.rotation.y = random() * Math.PI * 2;
    t.updateMatrixWorld(true);
    var bounds = new THREE.Box3().setFromObject(t);
    var leafWorld = new THREE.Matrix4(), leafCenter = new THREE.Vector3();
    for (var i = leafStart; i < leafRecords.length; i++) {
      var leaf = leafRecords[i];
      leafWorld.multiplyMatrices(leaf.parent.matrixWorld, leaf.matrix);
      bounds.expandByPoint(leafCenter.setFromMatrixPosition(leafWorld));
    }
    // Includes half-leaf length and the small wind offset.
    var crownRadius = Math.max(Math.hypot(bounds.min.x, bounds.min.z),
      Math.hypot(bounds.min.x, bounds.max.z), Math.hypot(bounds.max.x, bounds.min.z),
      Math.hypot(bounds.max.x, bounds.max.z)) + .5;
    var maxCrownRadius = 2.5;
    var horizontalScale = Math.min(1, maxCrownRadius / crownRadius);
    t.scale.set(horizontalScale, 1, horizontalScale);
    t.position.set(Math.sin(fa[0]) * 22.7, 0, Math.cos(fa[0]) * 22.7);
    t.name = 'foreground-tree';
    scene.add(t);
  });

  /* ---------- 10 · The Thinker, Auguste Rodin ----------
     Scan the World scan, CC BY-SA 4.0; see assets/models/the-thinker/README.md.
     Locally simplified mesh, with an added weathered bronze finish. */
  var statue = new THREE.Group();
  statue.name = 'thinker-monument';
  statue.rotation.y = -2.64;
  scene.add(statue);
  var pedestalMat = marbleMat.clone();
  pedestalMat.color.setHex(0x969887);
  pedestalMat.roughness = .82;
  pedestalMat.clearcoat = 0;
  var goldMat = new THREE.MeshStandardMaterial({
    color:0xb39952, metalness:.72, roughness:.36,
    envMap:marbleMat.envMap, envMapIntensity:.6
  });
  function monumentMesh(geometry, material, y) {
    var mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = mesh.receiveShadow = true;
    statue.add(mesh);
    return mesh;
  }
  monumentMesh(new THREE.CylinderGeometry(2.55,2.65,.30,8),pedestalMat,.15);
  monumentMesh(new THREE.CylinderGeometry(2.35,2.48,.20,8),pedestalMat,.40);
  monumentMesh(new THREE.CylinderGeometry(2.10,2.10,1.12,8),pedestalMat,1.06);
  monumentMesh(new THREE.CylinderGeometry(2.12,2.12,.032,8),goldMat,.56);
  monumentMesh(new THREE.CylinderGeometry(2.12,2.12,.032,8),goldMat,1.55);
  monumentMesh(new THREE.CylinderGeometry(2.40,2.23,.25,8),pedestalMat,1.745);
  var pedestalTop = 1.87;

  // Keep the architectural pedestal visible if the scan cannot load.
  // Do not substitute an unrelated sculpture for the selected work.

  // The solar aureole stays in the sculpture's local plane as the camera orbits.
  // Thin luminous rings retain real thickness; the depth-tested radiance fades
  // continuously instead of using opaque spokes or a camera-facing image.
  var aureole = new THREE.Group();
  aureole.name = 'thinker-aureole';
  aureole.position.set(0,5.55,-1.25);
  var haloMat = new THREE.MeshBasicMaterial({
    color:0xffe5a0,toneMapped:false
  });
  [1.04,1.095].forEach(function(radius,index){
    var ring=new THREE.Mesh(new THREE.TorusGeometry(radius,index===0?.008:.005,8,160),haloMat);
    ring.name='solar-halo-ring';
    aureole.add(ring);
  });
  var solarMat=new THREE.ShaderMaterial({
    extensions:{derivatives:true},
    transparent:true,depthWrite:false,depthTest:true,
    side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:[
      'varying vec2 vHalo;',
      'void main(){vHalo=position.xy;',
      'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
    ].join('\n'),
    fragmentShader:[
      'varying vec2 vHalo;',
      'const float TAU=6.28318530718;',
      'float hash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}',
      // Each ray has its own tapered width, length and brightness.
      'float rays(float angle,float radius,float count,float seed){',
      'float sector=(angle/TAU+0.5)*count;',
      'float id=floor(sector);float h=hash(id+seed);',
      'float offset=0.25+hash(id+seed+19.0)*0.5;',
      'float width=mix(0.012,0.075,h);',
      'float filteredWidth=max(width,min(0.3,fwidth(sector)*0.7));',
      'float line=exp(-pow((fract(sector)-offset)/filteredWidth,2.0))*width/filteredWidth;',
      'float reach=mix(1.28,2.10,hash(id+seed+43.0));',
      'float root=smoothstep(0.40,1.02,radius);',
      'float tip=1.0-smoothstep(1.08,reach,radius);',
      'float flicker=0.80+0.20*sin(radius*43.0+id*7.0);',
      'return line*root*tip*flicker*mix(0.18,0.85,h);}',
      'void main(){',
      'float r=length(vHalo);float a=atan(vHalo.y,vHalo.x);',
      'float inner=exp(-r*r*1.65)*0.38;',
      'float corona=exp(-pow((r-1.06)/0.24,2.0))*0.24;',
      'float rings=exp(-pow((r-1.04)/0.022,2.0))*0.65',
      '           +exp(-pow((r-1.095)/0.016,2.0))*0.46;',
      'float beams=rays(a,r,113.0,3.0)+rays(a,r,197.0,71.0)*0.42;',
      // Broad, faint shafts break up the space between the fine rays.
      'float fans=pow(max(0.0,sin(a*37.0+sin(a*11.0))),18.0);',
      'fans*=smoothstep(0.60,1.03,r)*(1.0-smoothstep(1.05,1.95,r))*0.12;',
      'float fade=1.0-smoothstep(1.80,2.15,r);',
      'float strength=(inner+corona+rings+beams+fans)*fade;',
      'vec3 gold=mix(vec3(1.0,0.48,0.055),vec3(1.0,0.83,0.36),clamp(rings,0.0,1.0));',
      'gl_FragColor=vec4(gold,min(strength,0.95));',
      '}'
    ].join('\n')
  });
  var solarGlow=new THREE.Mesh(new THREE.PlaneGeometry(4.4,4.4),solarMat);
  solarGlow.name='solar-corona';
  solarGlow.position.z=-.025;
  aureole.add(solarGlow);
  statue.add(aureole);
  // A local warm bounce ties the radiance to the scanned bronze surface.
  var haloBounce=new THREE.PointLight(0xffc363,.85,4.5,2);
  haloBounce.name='solar-halo-bounce';
  haloBounce.position.set(0,5.55,-1.0);
  statue.add(haloBounce);

  /* A warm shaft from above, opposed by a cool rim. Keep the environment
     darker, so the bronze anatomy reads without blowing out the highlights. */
  var sacredKey=new THREE.SpotLight(0xffdca0,3.2,45,.31,.8,1);
  sacredKey.name='sacred-key-light';
  sacredKey.position.set(-3.8,16,-5.2);
  sacredKey.target.position.set(0,3.5,0);
  sacredKey.castShadow=true;
  sacredKey.shadow.mapSize.set(1024,1024);
  sacredKey.shadow.bias=-.0001;
  sacredKey.shadow.normalBias=.025;
  sacredKey.shadow.camera.near=1;
  sacredKey.shadow.camera.far=40;
  scene.add(sacredKey,sacredKey.target);
  var sacredRim=new THREE.SpotLight(0xb6d6ed,2.5,32,.40,.85,1);
  sacredRim.name='thinker-rim-light';
  sacredRim.position.set(5.5,10.5,4);
  sacredRim.target.position.set(0,4.5,0);
  scene.add(sacredRim,sacredRim.target);

  // Feathered volumetric light: additive, depth tested, with no hard cone edge.
  var shaftMat=new THREE.ShaderMaterial({
    uniforms:{tint:{value:new THREE.Color(0xffd99a)},opacity:{value:.065}},
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,
    vertexShader:[
      'varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUV;',
      'void main(){ vUV=uv; vNormal=normalize(mat3(modelMatrix)*normal);',
      'vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;',
      'gl_Position=projectionMatrix*viewMatrix*world;}'
    ].join('\n'),
    fragmentShader:[
      'uniform vec3 tint;uniform float opacity;',
      'varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUV;',
      'void main(){',
      'float edge=pow(abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),2.4);',
      'float ends=smoothstep(0.0,0.2,vUV.y)*(1.0-smoothstep(0.72,1.0,vUV.y));',
      'gl_FragColor=vec4(tint,opacity*edge*ends);}'
    ].join('\n')
  });
  var shaftBottom=new THREE.Vector3(0,.3,0);
  var shaftDirection=sacredKey.position.clone().sub(shaftBottom);
  var shaft=new THREE.Mesh(new THREE.CylinderGeometry(.18,2.75,shaftDirection.length(),48,1,true),shaftMat);
  shaft.name='sacred-light-shaft';
  shaft.position.copy(shaftBottom).addScaledVector(shaftDirection,.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),shaftDirection.normalize());
  scene.add(shaft);

  if(THREE.GLTFLoader) {
    new THREE.GLTFLoader().load('assets/models/the-thinker/the-thinker.glb',function(gltf){
      var model=gltf.scene;
      model.name='thinker-scan';
      var bounds=new THREE.Box3().setFromObject(model);
      var size=bounds.getSize(new THREE.Vector3());
      var center=bounds.getCenter(new THREE.Vector3());
      var scale=4.30/size.y;
      var mount=new THREE.Group();mount.name='thinker-scan-mount';
      model.position.set(-center.x,-bounds.min.y,-center.z);
      mount.scale.setScalar(scale); mount.position.y=pedestalTop;
      mount.add(model);
      var bronze=new THREE.MeshStandardMaterial({
        color:0x766048,vertexColors:true,roughness:.64,metalness:.72,
        envMap:marbleMat.envMap,envMapIntensity:.55
      });
      model.traverse(function(mesh){
        if(!mesh.isMesh) return;
        mesh.castShadow=mesh.receiveShadow=true;
        // Object-space mottling follows the scan continuously, without UV seams.
        var position=mesh.geometry.attributes.position;
        var colors=new Float32Array(position.count*3);
        var warm=new THREE.Color(0x806b4b),patina=new THREE.Color(0x405f55);
        var color=new THREE.Color();
        for(var i=0;i<position.count;i++) {
          var x=position.getX(i),y=position.getY(i),z=position.getZ(i);
          var broad=Math.sin(x*31+y*17)*Math.sin(y*37-z*23)*Math.sin(z*29+x*19);
          var fine=Math.sin(x*311+z*197)*Math.sin(y*283-x*157);
          color.copy(warm).lerp(patina,.26+broad*.23).multiplyScalar(.91+fine*.065);
          color.toArray(colors,i*3);
        }
        mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
        mesh.material.dispose();
        mesh.material=bronze;
      });
      statue.add(mount);
      renderer.shadowMap.needsUpdate=true;
      renderAt(current);
    },undefined,function(){ /* the lit pedestal and portfolio remain usable */ });
  }

  /* soft ambient-occlusion contact shadow where marble meets gravel */
  (function contactAO() {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, "rgba(20,26,16,0.42)");
    grad.addColorStop(0.55, "rgba(20,26,16,0.18)");
    grad.addColorStop(1, "rgba(20,26,16,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    var ao = new THREE.Mesh(
      new THREE.CircleGeometry(3.1, 24),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    ao.rotation.x = -Math.PI / 2;
    ao.position.y = 0.055;              // stacked clear of plaza + pool
    scene.add(ao);
  })();

  /* weathering: lichen creeping up the pedestal's lowest step */
  /* NOTE: no vegetation inside the plinth exclusion ring —
     the base stays a clean pool of gravel and light. */


  /* World-scaled gravel texture: consistent grain on circular and straight paths. */
  scene.updateMatrixWorld(true);
  scene.traverse(function(mesh) {
    if(mesh.material!==gravelMat) return;
    var pos=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
    var v=new THREE.Vector3();
    for(var i=0;i<pos.count;i++) {
      v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      uv.setXY(i,v.x/2,v.z/2);
    }
    uv.needsUpdate=true;
  });
  bakeLeaves();

  /* pollen: very slow luminous particles drifting through the whole
     garden — the dreamlike dust the scene breathes */
  var pollen = null, pollenSeed = null;
  (function makePollen() {
    var N = smallScreen.matches ? 90 : 300;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(N * 3);
    pollenSeed = new Float32Array(N * 2);
    for (var i = 0; i < N; i++) {
      var a = random() * Math.PI * 2;
      var r = Math.sqrt(random()) * 23;
      pos[i * 3]     = Math.sin(a) * r;
      pos[i * 3 + 1] = 0.4 + random() * 5.2;   // below the skyline —
      pos[i * 3 + 2] = Math.cos(a) * r;             // never "stars" in the sky
      pollenSeed[i * 2] = random() * Math.PI * 2;   // phase
      pollenSeed[i * 2 + 1] = 0.1 + random() * 0.25; // rise speed
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var c = document.createElement("canvas");
    c.width = c.height = 32;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, "rgba(255,248,230,1)");
    grad.addColorStop(1, "rgba(255,248,230,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    pollen = new THREE.Points(geo, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c), color: 0xfdf6e0,
      size: 0.055, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.26 }));
    scene.add(pollen);
  })();

  /* Locally hosted CC0 photographic materials, with procedural fallbacks. */
  var textures = new THREE.TextureLoader();
  function photoMaterial(mat,name,rx,ry,normalStrength) {
    (name==='lawn' ? [['color','map'],['normal','normalMap']] : [['color','map'],['normal','normalMap'],['roughness','roughnessMap']]).forEach(function(pair) {
      textures.load('assets/textures/'+name+'_'+pair[0]+'.jpg',function(t) {
        t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
        t.anisotropy=maxAniso;
        if(pair[0]==='color') {
          t.encoding=THREE.sRGBEncoding;
          if(name==='lawn') {
            var c=document.createElement('canvas'); c.width=t.image.width; c.height=t.image.height;
            var g=c.getContext('2d'); g.filter='saturate(0.35) brightness(0.85)'; g.drawImage(t.image,0,0);
            t.image=c; t.needsUpdate=true;
          }
        }
        mat[pair[1]]=t;
        if(pair[0]==='normal') { mat.bumpMap=null; mat.normalScale=new THREE.Vector2(normalStrength,normalStrength); }
        mat.needsUpdate=true;
        if(!running) renderAt(current);
      },undefined,function() { /* keep the procedural material */ });
    });
  }
  photoMaterial(grassMat,'lawn',45,45,.3);
  photoMaterial(gravelMat,'gravelly_sand',1,1,.55);
  photoMaterial(trunkMat,'bark_brown_02',2,3,.85);
  photoMaterial(stoneMat,'sandstone_cracks',1,1,.6);

  /* ---------- 11 · The scroll-driven flight (à la logartis.info) ----
     The camera glides along a Catmull-Rom spline that sweeps ~240°
     around the statue while weaving in and out between the parterre
     rings and descending from a raised vantage to human eye level.
     The statue is always the look-at target. On desktop, moving the
     pointer adds a gentle free-flight sway around the path. */
  var flightPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-8.0, 6.0, -14.5),   // az 205° · r 17  — far approach
    new THREE.Vector3( 7.0, 4.3, -12.1),   // az 150° · r 14  — swing right
    new THREE.Vector3(11.5, 3.4,  -1.0),   // az  95° · r 11.5 — skim the parterre
    new THREE.Vector3( 8.8, 2.9,   8.8),   // az  45° · r 12.5 — weave outward
    new THREE.Vector3( 0.0, 2.9,  10.4),   // az   0° · r 10.4 — front of statue
    new THREE.Vector3(-6.1, 2.8,   8.7)    // az -35° · r 10.6 — settle, head clear
  ], false, "catmullrom", 0.5);

  var swayX = 0, swayY = 0, swayTX = 0, swayTY = 0;   // pointer free-flight
  var camPos = new THREE.Vector3();

  function placeCamera(p) {
    var e = p * p * (3 - 2 * p);      // settle at both ends of the walk
    flightPath.getPoint(e, camPos);
    // The taller aureole needs room beneath the fixed navigation on the tour.
    // A smooth lower bound avoids a sudden radial stop as the path turns.
    var routeRadius = Math.hypot(camPos.x, camPos.z);
    var radiusDelta = routeRadius - 16.3;
    var framedRadius = 16.3 + .5 * (radiusDelta + Math.sqrt(radiusDelta * radiusDelta + .16));
    camPos.x *= framedRadius / routeRadius;
    camPos.z *= framedRadius / routeRadius;
    /* pointer sway: orbit the path point slightly around the statue */
    if (swayX || swayY) {
      var az = Math.atan2(camPos.x, camPos.z) + swayX * 0.055;
      var r  = Math.hypot(camPos.x, camPos.z);
      camPos.x = Math.sin(az) * r;
      camPos.z = Math.cos(az) * r;
      camPos.y += -swayY * 0.4;
    }
    camera.position.copy(camPos);
    camera.lookAt(FOCUS);
    /* frame shift: content panels sit left, statue owns the right
       third — yaw the camera slightly so the statue is never
       occluded by the UI (desktop only) */
    if (!smallScreen.matches) camera.rotateY(0.20);
  }

  var current = 0, maxScroll = 1;
  var running = false, frame = 0, lastT = 0, elapsed = 0;
  var exploring = false, paused = reduceMotion.matches, pausedProgress = 0, lostContext = false;
  var returnFocus = null;
  var toolsUI = document.querySelector('.garden-tools');
  var exploreToggle = document.getElementById('explore-toggle');
  var motionToggle = document.getElementById('motion-toggle');
  var help = document.getElementById('explore-controls');
  var status = document.getElementById('garden-status');
  var controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, canvas) : null;
  if (controls) {
    controls.enabled = false;
    controls.enablePan = false;
    controls.enableDamping = !paused;
    controls.dampingFactor = .075;
    controls.rotateSpeed = .5;
    controls.zoomSpeed = .65;
    controls.minDistance = 9;
    controls.maxDistance = 18.5;
    controls.minPolarAngle = .35;
    controls.maxPolarAngle = 1.44;
    controls.target.copy(FOCUS);
    controls.addEventListener('change', function() {
      if (exploring && !running) draw();
    });
  }
  function measure() {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  }
  function draw() {
    if (lostContext) return;
    hemiLight.intensity = .38;
    fillLight.intensity = .055;
    sun.intensity = .90;
    renderer.render(scene, camera);
  }
  function renderAt(scrollPos) {
    if (!exploring) placeCamera(paused ? pausedProgress : Math.min(1, Math.max(0, scrollPos / maxScroll)));
    draw();
  }
  function onPointer(ev) {
    if (smallScreen.matches || paused || exploring || ev.pointerType !== 'mouse') return;
    swayTX = (ev.clientX / innerWidth - .5) * 2;
    swayTY = (ev.clientY / innerHeight - .5) * 2;
  }
  function loop(t) {
    frame = 0;
    if (!running) return;
    var dt = Math.min(.05, (t-lastT)/1000 || .016);
    lastT = t; elapsed += dt;
    current += ((window.scrollY || 0)-current) * (1-Math.exp(-dt*4));
    swayX += (swayTX-swayX) * (1-Math.exp(-dt*3));
    swayY += (swayTY-swayY) * (1-Math.exp(-dt*3));
    windTime.value = elapsed;
    driftClouds(dt * .12);
    if (pollen) pollen.rotation.y += dt * .008;
    if (exploring && controls) controls.update();
    renderAt(current);
    frame = requestAnimationFrame(loop);
  }
  function syncLoop() {
    running = !paused && !document.hidden && !lostContext;
    if (frame) { cancelAnimationFrame(frame); frame=0; }
    if (controls) controls.enableDamping = !paused;
    if (running) { lastT=performance.now(); frame=requestAnimationFrame(loop); }
    else renderAt(current);
    motionToggle.textContent = paused ? 'Play' : 'Pause';
    motionToggle.setAttribute('aria-pressed',String(paused));
    motionToggle.setAttribute('aria-label',paused ? 'Play garden animation' : 'Pause garden animation');
  }
  function setExploring(value, restoreFocus) {
    if (!controls || value===exploring) return;
    exploring=value;
    document.body.classList.toggle('exploring',value);
    document.getElementById('main').inert=value;
    document.querySelector('footer').inert=value;
    exploreToggle.setAttribute('aria-pressed',String(value));
    exploreToggle.textContent=value ? 'Back to portfolio ↗' : 'Explore ⤢';
    help.hidden=!value;
    document.getElementById('camera-help').textContent = matchMedia('(pointer: coarse)').matches
      ? 'One finger to orbit · Pinch to zoom'
      : 'Drag to orbit · Scroll to zoom · Arrow keys to look';
    canvas.setAttribute('aria-hidden',String(!value));
    if (value) {
      returnFocus=document.activeElement;
      canvas.tabIndex=0;
      canvas.setAttribute('role','region');
      canvas.setAttribute('aria-label','Interactive garden. Drag or use arrow keys to orbit. Scroll, pinch or use plus and minus to zoom. Escape returns to the portfolio.');
      controls.target.copy(FOCUS);
      controls.enabled=true;
      controls.update(); controls.saveState();
      canvas.focus({preventScroll:true});
      status.textContent='Garden exploration enabled. Drag to orbit, scroll or pinch to zoom. Escape to return.';
    } else {
      controls.enabled=false;
      canvas.removeAttribute('tabindex'); canvas.removeAttribute('role');
      current=window.scrollY;
      swayX=swayY=swayTX=swayTY=0;
      if (restoreFocus!==false && returnFocus) returnFocus.focus({preventScroll:true});
      status.textContent='Returned to portfolio.';
    }
    renderAt(current);
  }
  function preset(name) {
    var views={ overview:[-9,13,-12], statue:[-6.8,5.2,-14], parterre:[10,8,-13] };
    camera.position.fromArray(views[name] || views.overview);
    controls.target.copy(FOCUS);
    controls.update(); draw();
    status.textContent=name+' viewpoint.';
  }
  exploreToggle.addEventListener('click',function(){setExploring(!exploring);});
  document.querySelectorAll('[data-explore]').forEach(function(button){
    button.hidden=!controls;
    button.addEventListener('click',function(){setExploring(true);});
  });
  if (!controls) exploreToggle.hidden=true;
  motionToggle.addEventListener('click',function(){
    if(!paused) pausedProgress=Math.min(1,Math.max(0,current/maxScroll));
    paused=!paused;syncLoop();
  });
  document.querySelectorAll('[data-view]').forEach(function(button){
    button.addEventListener('click',function(){preset(button.dataset.view);});
  });
  document.getElementById('camera-reset').addEventListener('click',function(){controls.reset();draw();});
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape' && exploring) { setExploring(false); return; }
    if(!exploring || document.activeElement!==canvas) return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(ev.key)) return;
    ev.preventDefault();
    var offset=camera.position.clone().sub(controls.target);
    var spherical=new THREE.Spherical().setFromVector3(offset);
    if(ev.key==='ArrowLeft') spherical.theta-=.08;
    if(ev.key==='ArrowRight') spherical.theta+=.08;
    if(ev.key==='ArrowUp') spherical.phi-=.06;
    if(ev.key==='ArrowDown') spherical.phi+=.06;
    if(ev.key==='+' || ev.key==='=') spherical.radius*=.92;
    if(ev.key==='-') spherical.radius*=1.08;
    spherical.phi=THREE.MathUtils.clamp(spherical.phi,controls.minPolarAngle,controls.maxPolarAngle);
    spherical.radius=THREE.MathUtils.clamp(spherical.radius,controls.minDistance,controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update(); draw();
  });
  document.querySelectorAll('.nav a').forEach(function(link){
    link.addEventListener('click',function(){if(exploring) setExploring(false,false);});
  });
  window.addEventListener('pointermove',onPointer,{passive:true});
  window.addEventListener('resize',function(){
    camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,smallScreen.matches ? 1.25 : 1.5));
    renderer.setSize(innerWidth,innerHeight); measure(); renderAt(current);
  });
  window.addEventListener('scroll',function(){
    if(!running && !exploring) {current=window.scrollY;renderAt(current);}
  },{passive:true});
  document.addEventListener('visibilitychange',syncLoop);
  reduceMotion.addEventListener('change',function(ev){
    if(ev.matches) pausedProgress=Math.min(1,Math.max(0,current/maxScroll));
    paused=ev.matches;syncLoop();
  });
  canvas.addEventListener('webglcontextlost',function(ev){
    ev.preventDefault(); lostContext=true;
    if(exploring) setExploring(false);
    syncLoop(); toolsUI.hidden=true;
    document.querySelectorAll('[data-explore]').forEach(function(b){b.hidden=true;});
    status.textContent='Garden rendering is unavailable. The portfolio is still accessible.';
  });
  canvas.addEventListener('webglcontextrestored',function(){
    lostContext=false; renderer.shadowMap.needsUpdate=true;
    toolsUI.hidden=false;
    document.querySelectorAll('[data-explore]').forEach(function(b){b.hidden=!controls;});
    syncLoop();
  });
  if ('IntersectionObserver' in window) {
    var sectionObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(!entry.isIntersecting) return;
        document.querySelectorAll('.nav a').forEach(function(link){
          if(link.getAttribute('href')==='#'+entry.target.id) link.setAttribute('aria-current','location');
          else link.removeAttribute('aria-current');
        });
      });
    },{rootMargin:'-25% 0px -40% 0px'});
    document.querySelectorAll('section[id]').forEach(function(section){sectionObserver.observe(section);});
  }
  measure(); current=window.scrollY;
  renderer.shadowMap.needsUpdate=true;
  toolsUI.hidden=false;
  syncLoop();
})();
