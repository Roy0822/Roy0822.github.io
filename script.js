const canvas = document.getElementById("pixelScene");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("botTooltip");
const dpr = window.devicePixelRatio || 1;

const WORLD_W = 1200;
const WORLD_H = 680;

const sections = [
  {
    key: "about",
    title: "About",
    desc: "Researching AI agents, software intelligence, and human-AI collaboration.",
    color: "#da7b42",
  },
  {
    key: "education",
    title: "Education",
    desc: "M.S. in CS, focus on multi-agent systems and practical machine intelligence.",
    color: "#4f7fcb",
  },
  {
    key: "publications",
    title: "Publications",
    desc: "Papers and preprints on agent workflows and interactive development systems.",
    color: "#4f9f6d",
  },
  {
    key: "projects",
    title: "Projects",
    desc: "Building coding copilots, AI interfaces, and open-source research tools.",
    color: "#b267d7",
  },
  {
    key: "contact",
    title: "Contact",
    desc: "Find me on GitHub and by email for collaboration and academic opportunities.",
    color: "#dd6067",
  },
];

const signs = [
  { x: 120, y: 200, text: "ABOUT" },
  { x: 380, y: 200, text: "EDU" },
  { x: 640, y: 200, text: "PAPERS" },
  { x: 920, y: 200, text: "PROJECTS" },
  { x: 1040, y: 520, text: "CONTACT" },
];

const bots = sections.map((section, idx) => {
  const laneY = [260, 340, 430, 520, 600][idx];
  return {
    id: section.key,
    section,
    x: 120 + idx * 180,
    y: laneY,
    vx: (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.6),
    phase: Math.random() * Math.PI * 2,
    width: 22,
    height: 30,
    hover: false,
  };
});

const mouse = { x: -999, y: -999, inside: false };
let activeBot = null;

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round((rect.width * (WORLD_H / WORLD_W)) * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawRect(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function drawSceneBackground() {
  const scale = canvas.clientWidth / WORLD_W;
  const h = WORLD_H * scale;
  const w = WORLD_W * scale;

  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  sky.addColorStop(0, "#f9f3df");
  sky.addColorStop(1, "#ddf3ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  drawRect(0, h * 0.45, w, h * 0.06, "#8cb8e9");
  drawRect(0, h * 0.51, w, h * 0.49, "#cf9962");

  for (let i = 0; i < 8; i += 1) {
    drawRect(i * (w / 8), h * 0.53, 2, h * 0.47, "#bb8553");
  }

  drawRect(w * 0.44, h * 0.44, w * 0.12, h * 0.09, "#7d5a3e");
  drawRect(w * 0.445, h * 0.445, w * 0.11, h * 0.01, "#5f4530");
  drawRect(w * 0.445, h * 0.47, w * 0.11, h * 0.01, "#5f4530");

  signs.forEach((sign) => {
    const sx = sign.x * scale;
    const sy = sign.y * scale;
    drawRect(sx, sy, 70 * scale, 24 * scale, "#704734");
    drawRect(sx + 6 * scale, sy + 4 * scale, 58 * scale, 16 * scale, "#40271d");
    drawRect(sx + 30 * scale, sy + 24 * scale, 10 * scale, 40 * scale, "#704734");

    ctx.fillStyle = "#f8efd1";
    ctx.font = `${11 * scale}px VT323`;
    ctx.textAlign = "center";
    ctx.fillText(sign.text, sx + 35 * scale, sy + 16 * scale);
  });
}

function drawBot(bot, scale, time) {
  const bob = Math.sin(time * 0.005 + bot.phase) * 1.5;
  const x = bot.x * scale;
  const y = (bot.y + bob) * scale;
  const dir = bot.vx >= 0 ? 1 : -1;
  const main = bot.section.color;

  drawRect(x + 7 * scale, y + 2 * scale, 10 * scale, 8 * scale, "#2d2d35");
  drawRect(x + 8 * scale, y + 3 * scale, 8 * scale, 6 * scale, "#f0d8b8");
  drawRect(x + 5 * scale, y + 10 * scale, 16 * scale, 10 * scale, main);
  drawRect(x + 7 * scale, y + 20 * scale, 4 * scale, 8 * scale, "#38406b");
  drawRect(x + 13 * scale, y + 20 * scale, 4 * scale, 8 * scale, "#38406b");
  drawRect(x + 5 * scale, y + 11 * scale, 2 * scale, 5 * scale, "#f0d8b8");
  drawRect(x + 19 * scale, y + 11 * scale, 2 * scale, 5 * scale, "#f0d8b8");

  drawRect(x + (dir > 0 ? 14 : 8) * scale, y + 5 * scale, 2 * scale, 2 * scale, "#222");

  if (bot.hover) {
    const bubbleX = x - 30 * scale;
    const bubbleY = y - 28 * scale;
    drawRect(bubbleX, bubbleY, 82 * scale, 20 * scale, "#fffaf0");
    drawRect(bubbleX, bubbleY, 82 * scale, 2 * scale, "#2b2b34");
    drawRect(bubbleX, bubbleY + 18 * scale, 82 * scale, 2 * scale, "#2b2b34");
    drawRect(bubbleX, bubbleY, 2 * scale, 20 * scale, "#2b2b34");
    drawRect(bubbleX + 80 * scale, bubbleY, 2 * scale, 20 * scale, "#2b2b34");
    ctx.fillStyle = "#2b2b34";
    ctx.font = `${10 * scale}px VT323`;
    ctx.fillText(bot.section.title.toUpperCase(), bubbleX + 41 * scale, bubbleY + 13 * scale);
  }
}

function updateBots() {
  bots.forEach((bot) => {
    bot.x += bot.vx;
    const left = 20;
    const right = WORLD_W - 40;
    if (bot.x < left || bot.x > right) {
      bot.vx *= -1;
      bot.x = Math.max(left, Math.min(right, bot.x));
    }

    if (Math.random() < 0.004) {
      bot.vx *= -1;
    }
  });
}

function updateHover(scale) {
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;

  bots.forEach((bot) => {
    const bx = bot.x * scale + (bot.width * scale) / 2;
    const by = bot.y * scale + (bot.height * scale) / 2;
    const dx = mouse.x - bx;
    const dy = mouse.y - by;
    const dist = Math.hypot(dx, dy);
    bot.hover = false;

    if (dist < 40 * scale && dist < nearestDist) {
      nearest = bot;
      nearestDist = dist;
    }
  });

  if (mouse.inside && nearest) {
    activeBot = nearest;
    nearest.hover = true;
    canvas.style.cursor = "pointer";
    tooltip.classList.add("visible");
    tooltip.innerHTML = `<b>${nearest.section.title}</b>${nearest.section.desc}`;

    const tipX = Math.min(mouse.x + 16, canvas.clientWidth - 240);
    const tipY = Math.max(mouse.y - 72, 12);
    tooltip.style.left = `${tipX}px`;
    tooltip.style.top = `${tipY}px`;
  } else {
    activeBot = null;
    canvas.style.cursor = "default";
    tooltip.classList.remove("visible");
  }
}

function loop(time) {
  fitCanvas();
  const scale = canvas.clientWidth / WORLD_W;
  drawSceneBackground();
  updateBots();
  updateHover(scale);
  bots.forEach((bot) => drawBot(bot, scale, time));
  requestAnimationFrame(loop);
}

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  mouse.inside = true;

  if (window.anime) {
    const nx = (mouse.x / rect.width - 0.5) * 6;
    const ny = (mouse.y / rect.height - 0.5) * 4;
    anime({
      targets: "#pixelScene",
      translateX: nx,
      translateY: ny,
      duration: 250,
      easing: "easeOutQuad",
    });
  }
});

canvas.addEventListener("mouseleave", () => {
  mouse.inside = false;
  activeBot = null;
  canvas.style.cursor = "default";
  tooltip.classList.remove("visible");

  if (window.anime) {
    anime({
      targets: "#pixelScene",
      translateX: 0,
      translateY: 0,
      duration: 420,
      easing: "easeOutElastic(1, .7)",
    });
  }
});

canvas.addEventListener("click", () => {
  if (!activeBot) return;
  const section = document.getElementById(activeBot.id);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelectorAll(".menu a").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const targetId = link.getAttribute("href");
    const target = document.querySelector(targetId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.getElementById("year").textContent = new Date().getFullYear();

if (window.anime) {
  anime({
    targets: ".reveal-item",
    opacity: [0, 1],
    translateY: [18, 0],
    delay: anime.stagger(90),
    duration: 820,
    easing: "easeOutCubic",
  });

  anime({
    targets: ".fx-orb",
    translateY: [0, -24],
    translateX: () => anime.random(-8, 8),
    opacity: [0.28, 0.55],
    duration: () => anime.random(2400, 4200),
    direction: "alternate",
    loop: true,
    easing: "easeInOutSine",
    delay: anime.stagger(260),
  });

  anime({
    targets: ".scene-wrap",
    boxShadow: [
      "0 10px 0 rgba(0,0,0,0.16)",
      "0 14px 0 rgba(0,0,0,0.2)",
      "0 10px 0 rgba(0,0,0,0.16)",
    ],
    duration: 3800,
    easing: "easeInOutSine",
    loop: true,
  });
}

requestAnimationFrame(loop);
