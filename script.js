/* ================================================================
   CONSTANTS
   ================================================================ */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================================================================
   GARDEN LOADER  (anime.js foliage reveal)
   ================================================================ */
function initGardenLoader() {
  if (typeof anime === 'undefined') return;
  const loader = document.getElementById('gardenLoader');
  if (!loader) return;

  const glScene   = loader.querySelector('.gl-scene');
  const glBokeh   = document.getElementById('glBokeh');
  const glFoliage = document.getElementById('glFoliage');
  const glDark    = loader.querySelector('.gl-dark');
  const glVignette = loader.querySelector('.gl-vignette');
  const glFlash   = loader.querySelector('.gl-flash');
  const glHint    = loader.querySelector('.gl-hint');

  const W  = window.innerWidth;
  const H  = window.innerHeight;
  const cx = W / 2;
  const cy = H / 2;

  const COLORS = [
    '#0d2214','#152a1a','#1a3320','#122018','#1c3522',
    '#203828','#0e1e14','#1a3022','#253c2a','#162c1e',
    '#1e3a28','#0f2418','#1c3426','#182e1e','#213a2c',
  ];
  const SHAPES = [
    '0 100% 0 100%', '100% 0 100% 0',
    '50% 100% 50% 0', '0 50% 100% 50%',
    '30% 70%', '0 80%', '60% 0 60% 0',
  ];

  // Build leaves
  const leaves = [];
  for (let i = 0; i < 62; i++) {
    const el    = document.createElement('div');
    el.className = 'gl-leaf';
    const w     = 75 + Math.random() * 210;
    const h     = w * (0.45 + Math.random() * 0.85);
    const color = COLORS[i % COLORS.length];
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const blur  = Math.random() * 5;
    const rot   = Math.random() * 360;
    const alpha = 0.65 + Math.random() * 0.35;
    const lx    = cx + (Math.random() - 0.5) * W * 1.1;
    const ly    = cy + (Math.random() - 0.5) * H * 1.1;
    const dx    = lx - cx || 0.1;
    const dy    = ly - cy || 0.1;
    const mag   = Math.hypot(dx, dy) || 1;
    const speed = Math.max(W, H) * (0.45 + Math.random() * 0.5);
    el.style.cssText = `width:${w}px;height:${h}px;left:${lx-w/2}px;top:${ly-h/2}px;background:${color};border-radius:${shape};filter:blur(${blur}px);`;
    anime.set(el, { opacity: alpha, rotate: rot });
    glFoliage.appendChild(el);
    leaves.push({ el, vx: (dx / mag) * speed, vy: (dy / mag) * speed, rot, alpha });
  }

  // Build bokeh
  const bokehEls = [];
  [[140,220,80,14],[255,215,80,10],[255,250,220,7]].forEach(([r,g,b,n]) => {
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      const s  = 18 + Math.random() * 110;
      el.style.cssText = `position:absolute;width:${s}px;height:${s}px;left:${Math.random()*100}%;top:${Math.random()*100}%;border-radius:50%;background:radial-gradient(circle,rgba(${r},${g},${b},.75) 0%,transparent 70%);filter:blur(${7+Math.random()*18}px);opacity:0;pointer-events:none;`;
      glBokeh.appendChild(el);
      bokehEls.push(el);
    }
  });

  // Scene filter
  const sf = { blur: 28, bright: 0.22, sat: 0.4 };
  const applyFilter = () => {
    glScene.style.filter = `blur(${sf.blur.toFixed(1)}px) brightness(${sf.bright.toFixed(3)}) saturate(${sf.sat.toFixed(2)})`;
  };
  applyFilter();

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    document.body.classList.remove('loading');
    // Trigger "Enter the garden" text fade-in
    const enterEl = document.querySelector('.enter-garden');
    if (enterEl) {
      enterEl.style.animation = 'none';
      void enterEl.offsetWidth;
      enterEl.classList.add('visible');
    }
    anime({ targets: loader, opacity: 0, duration: 600, easing: 'easeInQuad',
      complete: () => { loader.style.display = 'none'; } });
  };

  loader.addEventListener('click', () => {
    anime.remove([loader, glDark, glVignette, glFlash, glHint, ...bokehEls, ...leaves.map(l => l.el)]);
    sf.blur = 0; sf.bright = 1; sf.sat = 1;
    applyFilter();
    glScene.style.transform = 'scale(1)';
    finish();
  }, { once: true });

  if (reduceMotion) { finish(); return; }

  anime({ targets: glScene, scale: [1.12, 1], duration: 3800, delay: 100, easing: 'easeInOutCubic' });
  anime({ targets: bokehEls, opacity: (el, i) => 0.15 + (i % 5) * 0.1, duration: 900,
    delay: anime.stagger(35, { from: 'random' }), easing: 'easeOutQuad' });
  anime({ targets: sf, blur: 0, bright: 1.08, sat: 1, duration: 2600, delay: 350,
    easing: 'easeInOutCubic', update: applyFilter });
  anime({ targets: glDark, opacity: 0, duration: 2300, delay: 500, easing: 'easeInOutSine' });
  anime({ targets: glVignette, opacity: 0, duration: 1800, delay: 1300, easing: 'easeInOutSine' });
  anime({ targets: bokehEls, opacity: 0, duration: 1200, delay: 2100, easing: 'easeInQuad' });
  anime({ targets: glHint, opacity: [0, 0.7, 0], duration: 2000, delay: 800, easing: 'easeInOutSine' });

  leaves.forEach(({ el, vx, vy, rot, alpha }) => {
    anime({
      targets: el,
      translateX: vx, translateY: vy,
      rotate: rot + 25 + Math.random() * 65,
      scale: [1, 1.2 + Math.random() * 0.6],
      opacity: [alpha, 0],
      duration: 1100 + Math.random() * 800,
      delay: 650 + Math.random() * 1000,
      easing: 'easeInCubic',
    });
  });

  anime({ targets: glFlash, opacity: [0, 0.65, 0], duration: 550, delay: 3050, easing: 'easeInOutSine' });
  anime({ targets: loader, opacity: 0, duration: 850, delay: 3350, easing: 'easeInQuad', complete: finish });
}

/* ================================================================
   THREE.JS WALLED GARDEN FLYTHROUGH
   ================================================================ */
function initGarden() {
  if (!window.THREE) return;
  const mount = document.getElementById('gardenMount');
  if (!mount) return;

  /* --- Renderer --- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
  renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled  = true;
  renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  /* --- Scene --- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xC8DCF0);
  scene.fog = new THREE.Fog(new THREE.Color(0xD0DCCC), 5, 40);

  /* --- Camera --- */
  const camera = new THREE.PerspectiveCamera(
    60,
    (mount.clientWidth || window.innerWidth) / (mount.clientHeight || window.innerHeight),
    0.1, 100
  );
  camera.position.set(0, 1.2, 25);

  /* --- Lights --- */
  const dirLight = new THREE.DirectionalLight(0xFFF8E7, 1.0);
  dirLight.position.set(8, 12, 4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.left   = -30;
  dirLight.shadow.camera.right  =  30;
  dirLight.shadow.camera.top    =  30;
  dirLight.shadow.camera.bottom = -30;
  dirLight.shadow.camera.far    =  70;
  scene.add(dirLight);
  scene.add(new THREE.AmbientLight(0x9ABCAA, 1.4));
  scene.add(new THREE.HemisphereLight(0x87CEEB, 0x5A8A42, 0.5));
  // Fill from left — illuminates the right hedge inner face
  const fillLight = new THREE.DirectionalLight(0xD4E8FF, 0.7);
  fillLight.position.set(-12, 8, 2);
  scene.add(fillLight);

  /* ---- Helpers ---- */

  // Hedge mesh: vertex colors darken bottom 15 %
  function makeHedge(w, h, d) {
    const geo = new THREE.BoxGeometry(w, h, d, 1, 4, 1);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const base = new THREE.Color(0x2A6B22);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h * 0.5) / h;      // 0 bottom → 1 top
      const b = 0.88 + t * 0.12;
      col[i*3]   = base.r * b;
      col[i*3+1] = base.g * b;
      col[i*3+2] = base.b * b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  // Striped lawn canvas texture (mowing stripes)
  function makeLawnTexture() {
    const size = 512;
    const cv   = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx  = cv.getContext('2d');
    const n    = 40;
    const sw   = size / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#3A7D2C' : '#4E9E3A';
      ctx.fillRect(0, i * sw, size, sw);
    }
    return new THREE.CanvasTexture(cv);
  }

  /* ---- Ground ---- */
  const grassMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshLambertMaterial({ color: 0x4A8A38 })
  );
  grassMesh.rotation.x = -Math.PI / 2;
  grassMesh.position.set(0, 0, -8);
  grassMesh.receiveShadow = true;
  scene.add(grassMesh);

  // Brick path strip (3 units wide)
  const pathMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.06, 70),
    new THREE.MeshLambertMaterial({ color: 0x8B5C42 })
  );
  pathMesh.position.set(0, 0.03, 0);
  pathMesh.receiveShadow = true;
  scene.add(pathMesh);

  /* ---- Long hedge corridor ---- */
  // Hedges run from Z=28 (behind camera start) to Z=-10 (garden entrance)
  // depth=38, center Z=9
  const lWall = makeHedge(2, 3, 38);
  lWall.position.set(-2.5, 1.5, 9);
  scene.add(lWall);

  const rWall = makeHedge(2, 3, 38);
  rWall.position.set(2.5, 1.5, 9);
  scene.add(rWall);

  /* ---- Circular lawn (centered at Z=−20) ---- */
  const lawnTex = makeLawnTexture();
  const lawn = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 0.1, 72),
    new THREE.MeshLambertMaterial({ map: lawnTex })
  );
  lawn.position.set(0, 0.05, -20);
  lawn.receiveShadow = true;
  scene.add(lawn);

  // Gravel ring around lawn
  const gravel = new THREE.Mesh(
    new THREE.CylinderGeometry(11.8, 11.8, 0.06, 72),
    new THREE.MeshLambertMaterial({ color: 0xB8A882 })
  );
  gravel.position.set(0, 0.03, -20);
  scene.add(gravel);

  /* ---- 8 octagon hedge segments around lawn ----
     Gaps at cardinal axes (N/S/E/W).  Camera enters from +Z (north gap).
     Segment angles offset by π/8 so gaps land at 0°, 90°, 180°, 270°.       */
  for (let i = 0; i < 8; i++) {
    const ang  = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r    = 13.5;
    const seg  = makeHedge(4.5, 2.5, 1.8);
    seg.position.set(Math.cos(ang) * r, 1.25, -20 + Math.sin(ang) * r);
    seg.rotation.y = -ang;
    scene.add(seg);
  }

  /* ---- Flower beds (16 boxes at radius 16) ---- */
  const fbColors = [0x7B4F8A, 0xC0392B, 0xE8A020, 0xC8D8B0];
  const fbGeo    = new THREE.BoxGeometry(1.5, 0.4, 1.5);
  for (let i = 0; i < 16; i++) {
    const ang  = (i / 16) * Math.PI * 2;
    const mesh = new THREE.Mesh(fbGeo, new THREE.MeshLambertMaterial({ color: fbColors[i % 4] }));
    mesh.position.set(Math.cos(ang) * 16, 0.2, -20 + Math.sin(ang) * 16);
    scene.add(mesh);
  }

  /* ---- Perimeter brick wall (36 segments at radius 18) ---- */
  const wGeo = new THREE.BoxGeometry(2.2, 1, 1.2);
  const wMat = new THREE.MeshLambertMaterial({ color: 0x6B3A2A });
  for (let i = 0; i < 36; i++) {
    const ang  = (i / 36) * Math.PI * 2;
    const seg  = new THREE.Mesh(wGeo, wMat);
    seg.position.set(Math.cos(ang) * 18, 0.5, -20 + Math.sin(ang) * 18);
    seg.rotation.y = ang + Math.PI / 2;
    seg.castShadow = seg.receiveShadow = true;
    scene.add(seg);
  }

  /* ---- Background topiaries for depth ---- */
  const topGeo = new THREE.CylinderGeometry(1.1, 1.35, 4.5, 7);
  const topMat = new THREE.MeshLambertMaterial({ color: 0x163818 });
  [[-9,0,-36],[9,0,-36],[-17,0,-28],[17,0,-28],[-22,0,-20],[22,0,-20]].forEach(([x,y,z]) => {
    const t = new THREE.Mesh(topGeo, topMat);
    t.position.set(x, 2.25, z);
    scene.add(t);
  });

  /* ---- Fade overlay div (crossfade loop) ---- */
  const fadeDiv = document.createElement('div');
  fadeDiv.style.cssText = 'position:absolute;inset:0;background:#0a1a0a;opacity:0;pointer-events:none;z-index:3;';
  mount.appendChild(fadeDiv);

  /* ================================================================
     CAMERA ANIMATION
     Start: (0, 1.2, 25) → End: (0, 6.0, -14) over 12 s
     lookAt: (0, 0, camera.z - 10)
     ================================================================ */
  const Z_START  = 25,  Z_END  = -14;
  const Y_START  = 1.2, Y_END  = 6.0;
  const DURATION = 12;  // seconds
  const FADE_DUR = 0.4; // seconds
  const TOTAL    = DURATION + FADE_DUR;
  let elapsed  = 0;
  let hovering = false;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  }

  // Hover: slow to 50%
  const heroEl = document.querySelector('.hero');
  if (heroEl) {
    heroEl.addEventListener('mouseenter', () => { hovering = true; });
    heroEl.addEventListener('mouseleave', () => { hovering = false; });
  }

  /* ---- Resize ---- */
  function onResize() {
    const w = mount.clientWidth  || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  /* ---- Render loop ---- */
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!reduceMotion) {
      elapsed += dt * (hovering ? 0.5 : 1.0);
      if (elapsed >= TOTAL) elapsed -= TOTAL;

      // Crossfade
      const inFade = elapsed > DURATION;
      if (inFade) {
        const fp = (elapsed - DURATION) / FADE_DUR;
        fadeDiv.style.opacity = fp < 0.5 ? (fp * 2).toFixed(3) : ((1 - fp) * 2).toFixed(3);
      } else {
        fadeDiv.style.opacity = '0';
      }

      const p = Math.min(elapsed / DURATION, 1);
      camera.position.z = Z_START + (Z_END - Z_START) * p;
      camera.position.y = Y_START + (Y_END - Y_START) * easeInOutCubic(p);
      camera.position.x = 0;
      camera.lookAt(0, 0, camera.position.z - 10);
    } else {
      camera.position.set(0, 5, 2);
      camera.lookAt(0, 0, -20);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/* ================================================================
   PAGE INIT  (nav, reveal, smooth scroll)
   ================================================================ */
function init() {
  /* Year in footer */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* Nav visibility: appears after hero scrolls out */
  const nav   = document.getElementById('sitenav');
  const hero  = document.getElementById('hero');
  if (nav && hero) {
    new IntersectionObserver(
      ([e]) => nav.classList.toggle('visible', !e.isIntersecting),
      { threshold: 0.1 }
    ).observe(hero);
  }

  /* Section reveal */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      }),
      { threshold: 0.12 }
    );
    revealEls.forEach(el => obs.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('visible'));
  }

  /* Smooth scroll for nav + enter-garden links */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* ================================================================
   BOOT
   ================================================================ */
initGardenLoader();
initGarden();
init();
