const stage = document.getElementById("stage");
const fogCanvas = document.getElementById("fogCanvas");
const tooltip = document.getElementById("nodeTooltip");
const nodes = Array.from(document.querySelectorAll(".orbit-node"));
const menuLinks = Array.from(document.querySelectorAll(".menu a"));
const revealEls = Array.from(document.querySelectorAll(".reveal"));

const pointer = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
};

const sceneTone = {
  value: 0,
  target: 0,
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updatePerspectiveTargets(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;

  pointer.targetX = clamp((nx - 0.5) * 2, -1, 1);
  pointer.targetY = clamp((ny - 0.5) * 2, -1, 1);
}

function setNeutralPerspective() {
  pointer.targetX = 0;
  pointer.targetY = 0;
}

function syncSceneByScroll() {
  const doc = document.documentElement;
  const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
  const progress = clamp(window.scrollY / maxScroll, 0, 1);
  sceneTone.target = progress;
}

function animatePerspective() {
  pointer.currentX += (pointer.targetX - pointer.currentX) * 0.08;
  pointer.currentY += (pointer.targetY - pointer.currentY) * 0.08;

  sceneTone.value += (sceneTone.target - sceneTone.value) * 0.06;

  const tiltBoost = sceneTone.value * 3.2;
  const rx = pointer.currentY * -7 - tiltBoost;
  const ry = pointer.currentX * 9;

  stage.style.setProperty("--rx", `${rx.toFixed(3)}deg`);
  stage.style.setProperty("--ry", `${ry.toFixed(3)}deg`);
  stage.style.setProperty("--mx", pointer.currentX.toFixed(4));
  stage.style.setProperty("--my", pointer.currentY.toFixed(4));
  stage.style.setProperty("--scene-shift", sceneTone.value.toFixed(4));
}

function showTooltip(node) {
  const rect = stage.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();

  const title = node.dataset.title || "";
  const desc = node.dataset.desc || "";
  tooltip.innerHTML = `<strong>${title}</strong>${desc}`;

  const left = clamp(nodeRect.left - rect.left + nodeRect.width / 2 + 14, 12, rect.width - 220);
  const top = clamp(nodeRect.top - rect.top - 68, 12, rect.height - 90);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.add("visible");
}

function hideTooltip() {
  tooltip.classList.remove("visible");
}

function bindNodeInteractions() {
  nodes.forEach((node) => {
    node.addEventListener("mouseenter", () => {
      showTooltip(node);
    });

    node.addEventListener("mousemove", (e) => {
      updatePerspectiveTargets(e.clientX, e.clientY);
      showTooltip(node);
    });

    node.addEventListener("mouseleave", () => {
      hideTooltip();
    });

    node.addEventListener("focus", () => {
      showTooltip(node);
    });

    node.addEventListener("blur", () => {
      hideTooltip();
    });

    node.addEventListener("click", () => {
      const targetId = node.dataset.target;
      if (!targetId) return;
      const section = document.getElementById(targetId);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function bindStageInteractions() {
  stage.addEventListener("mousemove", (e) => {
    updatePerspectiveTargets(e.clientX, e.clientY);
  });

  stage.addEventListener("mouseleave", () => {
    setNeutralPerspective();
    hideTooltip();
  });

  stage.addEventListener(
    "touchmove",
    (e) => {
      if (!e.touches[0]) return;
      const t = e.touches[0];
      updatePerspectiveTargets(t.clientX, t.clientY);
    },
    { passive: true },
  );

  stage.addEventListener("touchend", () => {
    setNeutralPerspective();
    hideTooltip();
  });
}

function bindMenuSmoothScroll() {
  menuLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.getAttribute("href");
      if (!targetId) return;
      document.querySelector(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function initRevealObserver() {
  if (!("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: "0px 0px -10% 0px",
    },
  );

  revealEls.forEach((el) => observer.observe(el));
}

function initScrollLinking() {
  syncSceneByScroll();
  window.addEventListener("scroll", syncSceneByScroll, { passive: true });
}

function initWebGLFog() {
  if (!window.THREE || reduceMotion) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: fogCanvas,
      antialias: true,
      alpha: true,
    });
  } catch (_err) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
  camera.position.set(0, 0, 20);

  const particleCount = 900;
  const positions = new Float32Array(particleCount * 3);
  const scales = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    const ix = i * 3;
    positions[ix] = (Math.random() - 0.5) * 42;
    positions[ix + 1] = (Math.random() - 0.5) * 24;
    positions[ix + 2] = (Math.random() - 0.5) * 28;
    scales[i] = 0.35 + Math.random() * 1.8;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uTone: { value: 0 },
      uBaseA: { value: new THREE.Color("#7bd3ff") },
      uBaseB: { value: new THREE.Color("#cde7ff") },
      uDeepA: { value: new THREE.Color("#6f9eff") },
      uDeepB: { value: new THREE.Color("#9ff9ff") },
    },
    vertexShader: `
      attribute float aScale;
      uniform float uTime;
      uniform float uTone;
      varying float vMix;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.45 + p.x * 0.22) * (0.28 + uTone * 0.4);
        p.x += cos(uTime * 0.32 + p.y * 0.24) * 0.2;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aScale * (7.0 + uTone * 4.0) * (35.0 / -mvPosition.z);
        vMix = clamp((p.y + 12.0) / 24.0, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTone;
      uniform vec3 uBaseA;
      uniform vec3 uBaseB;
      uniform vec3 uDeepA;
      uniform vec3 uDeepB;
      varying float vMix;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float alpha = smoothstep(0.52, 0.05, d) * (0.24 + uTone * 0.28);
        vec3 c0 = mix(uBaseA, uBaseB, vMix);
        vec3 c1 = mix(uDeepA, uDeepB, vMix);
        vec3 color = mix(c0, c1, uTone);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  function resize() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const handleResize = () => resize();
  let ro = null;
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(handleResize);
    ro.observe(stage);
  } else {
    window.addEventListener("resize", handleResize);
  }
  resize();

  return {
    scene,
    material,
    points,
    camera,
    renderer,
    destroy() {
      if (ro) {
        ro.disconnect();
      } else {
        window.removeEventListener("resize", handleResize);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}

function init() {
  bindNodeInteractions();
  bindStageInteractions();
  bindMenuSmoothScroll();
  initRevealObserver();
  initScrollLinking();

  const webgl = initWebGLFog();

  let last = performance.now();
  function tick(now) {
    const dt = (now - last) / 1000;
    last = now;

    animatePerspective();

    if (webgl) {
      webgl.material.uniforms.uTime.value += dt;
      webgl.material.uniforms.uTone.value = sceneTone.value;
      webgl.points.rotation.y += dt * (0.035 + sceneTone.value * 0.08);
      webgl.points.rotation.x = Math.sin(webgl.material.uniforms.uTime.value * 0.18) * 0.08;
      webgl.camera.position.z = 20 - sceneTone.value * 2.6;
      webgl.renderer.render(webgl.scene, webgl.camera);
    }

    requestAnimationFrame(tick);
  }

  document.getElementById("year").textContent = new Date().getFullYear();
  requestAnimationFrame(tick);
}

init();
