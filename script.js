const button = document.getElementById("heart-button");
const canvas = document.getElementById("heart-canvas");
const hint = document.getElementById("hint");
const ctx = canvas.getContext("2d");

const DRAW_MS = 2600;
const FILL_MS = 700;
const BEAT_MS = 1000;
const TOTAL_MS = DRAW_MS + FILL_MS + BEAT_MS;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const touchFirst = window.matchMedia("(hover: none), (pointer: coarse)");

const heart = buildHeart(720);

let width = 0;
let height = 0;
let dpr = 1;
let frameId = 0;
let running = false;
let startTime = 0;
let lastFrame = 0;
let elapsed = null;
let particles = [];

function buildHeart(count) {
  const raw = [];
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 2;
    raw.push({
      x: 16 * Math.sin(t) ** 3,
      y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    });
  }
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const points = raw.map((p) => ({ x: (p.x - cx) / span, y: (p.y - cy) / span }));
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  return { points, lengths, total: lengths[lengths.length - 1] };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function heartbeat(t) {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.32) return Math.sin((t / 0.32) * Math.PI);
  if (t < 0.7) return 0.6 * Math.sin(((t - 0.32) / 0.38) * Math.PI);
  return 0;
}

function layout() {
  const size = Math.min(width, height);
  return { size, cx: width / 2, cy: height / 2, scale: size * 0.6 };
}

function toScreen(point, view) {
  return { x: view.cx + point.x * view.scale, y: view.cy + point.y * view.scale };
}

function locate(distance) {
  const { points, lengths } = heart;
  let lo = 0;
  let hi = lengths.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] < distance) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return { index: 0, point: points[0] };
  const a = points[lo - 1];
  const b = points[lo];
  const segment = lengths[lo] - lengths[lo - 1];
  const f = segment > 0 ? (distance - lengths[lo - 1]) / segment : 0;
  return { index: lo, point: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f } };
}

function tracePartial(distance, view) {
  const { points } = heart;
  const end = locate(distance);
  ctx.beginPath();
  const first = toScreen(points[0], view);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < end.index; i++) {
    const p = toScreen(points[i], view);
    ctx.lineTo(p.x, p.y);
  }
  const tip = toScreen(end.point, view);
  ctx.lineTo(tip.x, tip.y);
  return tip;
}

function traceFull(view) {
  const { points } = heart;
  ctx.beginPath();
  points.forEach((point, i) => {
    const p = toScreen(point, view);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

function drawGuide(view, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash([view.size * 0.02, view.size * 0.026]);
  ctx.lineWidth = Math.max(1, view.size * 0.01);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255, 150, 190, 0.28)";
  traceFull(view);
  ctx.stroke();
  ctx.restore();
}

function drawFill(view, progress) {
  if (progress <= 0) return;
  ctx.save();
  ctx.globalAlpha = progress;
  const gradient = ctx.createRadialGradient(
    view.cx - view.scale * 0.18,
    view.cy - view.scale * 0.22,
    view.scale * 0.05,
    view.cx,
    view.cy,
    view.scale * 0.75,
  );
  gradient.addColorStop(0, "#ff9ab9");
  gradient.addColorStop(0.45, "#f0336f");
  gradient.addColorStop(1, "#a3123f");
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(255, 60, 120, 0.55)";
  ctx.shadowBlur = view.size * 0.08 * progress;
  traceFull(view);
  ctx.fill();
  ctx.restore();
}

function drawStroke(view, progress) {
  if (progress <= 0) return null;
  ctx.save();
  const gradient = ctx.createLinearGradient(
    view.cx - view.scale * 0.5,
    view.cy - view.scale * 0.5,
    view.cx + view.scale * 0.5,
    view.cy + view.scale * 0.5,
  );
  gradient.addColorStop(0, "#ffc2d7");
  gradient.addColorStop(1, "#ff4f8b");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(2, view.size * 0.028);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255, 70, 130, 0.75)";
  ctx.shadowBlur = view.size * 0.05;
  const tip = tracePartial(progress * heart.total, view);
  ctx.stroke();
  ctx.restore();
  return tip;
}

function drawPen(view, tip) {
  ctx.save();
  ctx.fillStyle = "#fff3f8";
  ctx.shadowColor = "rgba(255, 110, 160, 1)";
  ctx.shadowBlur = view.size * 0.07;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, Math.max(2.5, view.size * 0.022), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function spawnParticles(view, tip, dt) {
  const count = Math.round(dt / 8);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = view.size * (0.00008 + Math.random() * 0.00022);
    const life = 450 + Math.random() * 500;
    particles.push({
      x: tip.x,
      y: tip.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      age: 0,
      radius: view.size * (0.004 + Math.random() * 0.008),
    });
  }
}

function updateParticles(dt) {
  particles = particles.filter((p) => {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.0000015 * dt * width;
    return p.age < p.life;
  });
}

function drawParticles() {
  if (!particles.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  particles.forEach((p) => {
    const fade = 1 - p.age / p.life;
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#ff8fb5";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * (0.4 + fade * 0.6), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function render(time, dt = 0) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!width || !height) return;

  const view = layout();
  const drawProgress = time === null ? 0 : easeInOut(clamp01(time / DRAW_MS));
  const fillProgress = time === null ? 0 : easeOut(clamp01((time - DRAW_MS) / FILL_MS));
  const beatProgress = time === null ? 0 : clamp01((time - DRAW_MS - FILL_MS * 0.4) / BEAT_MS);
  const pulse = reducedMotion.matches ? 0 : heartbeat(beatProgress);
  const zoom = 1 + 0.085 * pulse;

  ctx.save();
  ctx.translate(view.cx, view.cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-view.cx, -view.cy);
  drawGuide(view, 1 - fillProgress);
  drawFill(view, fillProgress);
  const tip = drawStroke(view, drawProgress);
  ctx.restore();

  const penActive = tip && drawProgress < 1;
  if (penActive && dt > 0 && !reducedMotion.matches) spawnParticles(view, tip, dt);
  drawParticles();
  if (penActive) drawPen(view, tip);
}

function tick(now) {
  const dt = Math.min(50, now - lastFrame);
  lastFrame = now;
  elapsed = now - startTime;
  updateParticles(dt);
  render(elapsed, dt);
  if (elapsed < TOTAL_MS || particles.length) {
    frameId = requestAnimationFrame(tick);
  } else {
    finish();
  }
}

function start() {
  cancelAnimationFrame(frameId);
  particles = [];
  running = true;
  startTime = performance.now();
  lastFrame = startTime;
  elapsed = 0;
  button.classList.add("is-drawing");
  button.setAttribute("aria-busy", "true");
  updateHint();
  frameId = requestAnimationFrame(tick);
}

function finish() {
  running = false;
  elapsed = TOTAL_MS;
  button.classList.remove("is-drawing");
  button.removeAttribute("aria-busy");
  render(elapsed);
  updateHint();
}

function updateHint() {
  const verb = touchFirst.matches ? "Tap" : "Click";
  if (running) hint.textContent = "Drawing…";
  else if (elapsed !== null) hint.textContent = `${verb} again to redraw`;
  else hint.textContent = `${verb} the button to draw a heart`;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  if (!running) render(elapsed);
}

function onMediaChange(query, handler) {
  if (query.addEventListener) query.addEventListener("change", handler);
  else if (query.addListener) query.addListener(handler);
}

button.addEventListener("click", start);
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);
onMediaChange(touchFirst, updateHint);
onMediaChange(reducedMotion, () => {
  if (!running) render(elapsed);
});

if ("ResizeObserver" in window) {
  new ResizeObserver(resize).observe(canvas);
}

resize();
updateHint();
