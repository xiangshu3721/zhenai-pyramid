// 珍爱金字塔 3D：纯 SVG 伪 3D（真实旋转 + 轻微透视 + 画家算法 + 明暗），零依赖。
// 同一份几何既用于页面里可拖动的交互版，也用于导出长图的静态版（不依赖 CSS 3D，截图/导出都稳）。
import { DIMS } from "./data.js";
import { levelOf } from "./scoring.js";
import { LEVEL_COLOR } from "./charts.js";

const colorOf = (s) => LEVEL_COLOR[levelOf(s).id];
const INK = "#2A2521", SEAL = "#A8432F", PAPER = "#EFE6D3", RING_EMPTY = "#E4D9C0", HALO = "#F6F0E2";
export const VIEWBOX = { x: -200, y: -140, w: 400, h: 404 };
export const DEFAULT_VIEW = { yaw: -24, pitch: 24 };
export const YAW_LIMIT = 50;
const CAM = 1250;        // 相机距离（越大越接近正交）
const CENTER_Y = 150;    // 绕模型中部旋转
const f1 = (n) => Math.round(n * 10) / 10;
const rad = (d) => (d * Math.PI) / 180;

/* ---------- 几何尺寸（世界坐标：x 右、y 上、z 朝向观众） ---------- */
const G = {
  platRx: 176, platRz: 124, platH: 16,
  pillarW: 31, pillarD: 44, pillarGap: 6, pillarH: 112,       // 半宽/半深
  slabH: 62, slabW0: 150, slabD0: 56, slabW1: 100, slabD1: 36,
  topH: 86, topW0: 96, topD0: 40,
};
// 四根支柱的左→右顺序与原 2D 图一致：有序性 / 平和性 / 自聚性 / 积极性
const PILLARS = ["C", "E", "B", "D"];

/* ---------- 颜色 ---------- */
function hex(c) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
function shadeHex(c, k) {
  const [r, g, b] = hex(c).map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${r},${g},${b})`;
}

/* ---------- 视图变换 ---------- */
function makeView(yawDeg, pitchDeg) {
  const cy = Math.cos(rad(yawDeg)), sy = Math.sin(rad(yawDeg));
  const cp = Math.cos(rad(pitchDeg)), sp = Math.sin(rad(pitchDeg));
  return {
    // 世界 → 相机坐标（先绕 y 转，再俯视倾斜）
    toView([x, y, z]) {
      y -= CENTER_Y;
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    },
    // 相机坐标 → 屏幕
    toScreen([x, y, z]) { const s = CAM / (CAM - z); return [x * s, -y * s]; },
  };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const LIGHT = norm([-0.55, 0.85, 0.55]); // 相机坐标系里：左上前方打光

/* ---------- 实体：棱台/棱锥，椭圆台 ---------- */
function frustumFaces(y0, y1, w0, d0, w1, d1, cx = 0, cz = 0, noTop = false) {
  const ring = (y, w, d) => [[cx - w, y, cz - d], [cx + w, y, cz - d], [cx + w, y, cz + d], [cx - w, y, cz + d]];
  const b = ring(y0, w0, d0), apex = w1 <= 0.01 && d1 <= 0.01;
  const faces = [];
  if (apex) {
    const a = [cx, y1, cz];
    for (let i = 0; i < 4; i++) faces.push([b[i], b[(i + 1) % 4], a]);
  } else {
    const t = ring(y1, w1, d1);
    for (let i = 0; i < 4; i++) faces.push([b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]]);
    if (!noTop) faces.push(t);
  }
  return { faces, center: [cx, (y0 + y1) / 2, cz] };
}
function ellipseFaces(y0, y1, rx, rz, n = 40) {
  const pt = (i, y, k = 1) => [Math.cos((i / n) * Math.PI * 2) * rx * k, y, Math.sin((i / n) * Math.PI * 2) * rz * k];
  const faces = [];
  for (let i = 0; i < n; i++) faces.push([pt(i, y0), pt(i + 1, y0), pt(i + 1, y1), pt(i, y1)]);
  faces.push(Array.from({ length: n }, (_, i) => pt(i, y1)).reverse());
  return { faces, center: [0, (y0 + y1) / 2, 0] };
}

/* ---------- 场景：输出绘制指令（纯函数，可在 node 里测试） ---------- */
export function buildScene(scores, total, lowest, view = DEFAULT_VIEW) {
  const V = makeView(view.yaw, view.pitch);
  const ops = [];     // {t:"poly", pts, fill, stroke, dash, sw, op}
  const labels = [];  // {kind:"label"|"seal"|"chip", ...}

  // solid(): 把一个凸体的各面转成多边形指令（背面剔除 + 明暗）
  function solid({ faces, center }, { fill, glass = false, leak = false, dash = false }) {
    const c = V.toView(center);
    const items = [];
    for (const face of faces) {
      const pv = face.map((p) => V.toView(p));
      let n = norm(cross(sub(pv[1], pv[0]), sub(pv[2], pv[0])));
      const fc = pv.reduce((a, p) => [a[0] + p[0] / pv.length, a[1] + p[1] / pv.length, a[2] + p[2] / pv.length], [0, 0, 0]);
      if (dot(n, sub(fc, c)) < 0) n = [-n[0], -n[1], -n[2]]; // 法线朝外
      if (dot(n, sub([0, 0, CAM], fc)) <= 0) continue;        // 背面
      const k = 0.55 + 0.6 * Math.max(0, dot(n, LIGHT));
      const pts = pv.map((p) => V.toScreen(p));
      items.push({ t: "poly", pts, fill: glass ? shadeHex(fill, 0.97 + 0.03 * k) : shadeHex(fill, k), glass,
        stroke: leak ? SEAL : INK, so: leak ? 1 : glass ? 0.38 : 0.5, sw: leak ? 1.9 : 0.9, dash: leak && dash, z: fc[2] });
    }
    items.sort((a, b) => a.z - b.z);
    ops.push(...items);
  }
  const frac = (s) => Math.max(0, Math.min(1, s / 100));
  // 分层填充：下部按分数上色，上部为空（半透明纸）
  function tier(y0, y1, w0, d0, w1, d1, score, opt) {
    const t = frac(score), lerp = (a, b, u) => a + (b - a) * u;
    const ym = lerp(y0, y1, t), wm = lerp(w0, w1, t), dm = lerp(d0, d1, t);
    const col = colorOf(score);
    if (t > 0.005) solid(frustumFaces(y0, ym, w0, d0, wm, dm, opt.cx || 0, opt.cz || 0, t < 0.995), { fill: col, leak: opt.leak, dash: opt.leak });
    if (t < 0.995) solid(frustumFaces(ym, y1, wm, dm, w1, d1, opt.cx || 0, opt.cz || 0), { fill: PAPER, glass: true, leak: opt.leak, dash: opt.leak });
  }
  const proj = (p) => V.toScreen(V.toView(p));

  /* 1) 底座：外圈「理解与边界」 */
  const { platRx: rx, platRz: rz, platH: ph } = G;
  const ringLeak = lowest === "F";
  const F = scores.F;
  solid(ellipseFaces(0, ph, rx, rz), { fill: colorOf(F), leak: ringLeak, dash: ringLeak });
  // 顶面环：已填充弧 + 空弧
  const N = 72, a0 = Math.PI / 2; // 从正前方起，顺时针（俯视）
  const arc = (from, to, k0, k1) => {
    const steps = Math.max(2, Math.ceil(((to - from) / (Math.PI * 2)) * N));
    const out = [], inn = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + from + ((to - from) * i) / steps;
      out.push([Math.cos(a) * rx * k1, ph + 0.4, Math.sin(a) * rz * k1]);
      inn.push([Math.cos(a) * rx * k0, ph + 0.4, Math.sin(a) * rz * k0]);
    }
    return [...out, ...inn.reverse()].map((p) => V.toScreen(V.toView(p)));
  };
  // 顶面（椭圆）
  ops.push({ t: "poly", pts: Array.from({ length: 48 }, (_, i) => proj([Math.cos((i / 48) * 6.2832) * rx, ph, Math.sin((i / 48) * 6.2832) * rz])),
    fill: shadeHex(PAPER, 1.04), stroke: ringLeak ? SEAL : INK, so: ringLeak ? 1 : 0.5, sw: ringLeak ? 1.9 : 0.9, dash: ringLeak, z: -1e6 });
  const A = Math.PI * 2 * frac(F);
  if (F < 99.5) ops.push({ t: "poly", pts: arc(A, Math.PI * 2, 0.8, 0.94), fill: RING_EMPTY, stroke: INK, so: 0.3, sw: 0.7, z: -1e6 });
  if (F > 0.5) ops.push({ t: "poly", pts: arc(0, A, 0.8, 0.94), fill: colorOf(F), stroke: INK, so: 0.45, sw: 0.9, z: -1e6 });
  // 底座文字条：始终在底座正下方
  let maxY = -1e9;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    maxY = Math.max(maxY, proj([Math.cos(a) * rx, 0, Math.sin(a) * rz])[1]);
  }
  labels.push({ kind: "chip", x: 0, y: Math.max(maxY + 22, 238), name: DIMS.F.name, score: F, leak: ringLeak });

  /* 2) 四根支柱（有序性 / 平和性 / 自聚性 / 积极性） */
  const py0 = ph, py1 = ph + G.pillarH, span = G.pillarW * 2 + G.pillarGap;
  const pillarOrder = PILLARS.map((k, i) => ({ k, cx: (i - 1.5) * span }));
  // 软影：压在底座上
  for (const { cx } of pillarOrder) {
    ops.push({ t: "poly", pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => proj([cx + sx * (G.pillarW + 7), ph + 0.6, sz * (G.pillarD + 7)])),
      fill: "#2A2521", fo: 0.13, stroke: "none", z: -1e5 });
  }
  const drawn = pillarOrder.map((p) => ({ ...p, depth: V.toView([p.cx, 0, 0])[2] })).sort((a, b) => a.depth - b.depth);
  for (const p of drawn) {
    tier(py0, py1, G.pillarW, G.pillarD, G.pillarW, G.pillarD, scores[p.k], { cx: p.cx, leak: lowest === p.k });
  }
  for (const p of pillarOrder) {
    const pos = proj([p.cx, py0 + G.pillarH * 0.47, G.pillarD]);
    labels.push({ kind: "vlabel", x: pos[0], y: pos[1], name: DIMS[p.k].name, score: scores[p.k], size: 15 });
    if (lowest === p.k) { const s = proj([p.cx + G.pillarW * 0.5, py1 - 14, G.pillarD]); labels.push({ kind: "seal", x: s[0], y: s[1] }); }
  }

  /* 3) 中层：允许接纳（棱台） */
  const sy0 = py1, sy1 = py1 + G.slabH;
  tier(sy0, sy1, G.slabW0, G.slabD0, G.slabW1, G.slabD1, scores.A, { leak: lowest === "A" });
  {
    const pos = proj([0, (sy0 + sy1) / 2, (G.slabD0 + G.slabD1) / 2]);
    labels.push({ kind: "label", x: pos[0], y: pos[1], name: DIMS.A.name, score: scores.A, size: 17 });
    if (lowest === "A") { const s = proj([(G.slabW0 + G.slabW1) / 2 * 0.74, (sy0 + sy1) / 2, (G.slabD0 + G.slabD1) / 2]); labels.push({ kind: "seal", x: s[0], y: s[1] }); }
  }

  /* 4) 顶端：珍爱（棱锥，整体加权分） */
  const ty0 = sy1 + 3, ty1 = ty0 + G.topH;
  tier(ty0, ty1, G.topW0, G.topD0, 0, 0, total, { leak: false });
  {
    const u = 0.36, pos = proj([0, ty0 + G.topH * u, G.topD0 * (1 - u)]);
    labels.push({ kind: "label", x: pos[0], y: pos[1], name: "珍爱", score: total, size: 16 });
  }
  return { ops, labels, view };
}

/* ---------- 指令 → SVG 字符串 ---------- */
function labelSVG(L) {
  if (L.kind === "seal") {
    return `<g transform="translate(${f1(L.x)},${f1(L.y)}) rotate(-6)"><rect x="-11" y="-11" width="22" height="22" rx="3" fill="${SEAL}" stroke="#FBF3E4" stroke-width="1.2"/><text x="0" y="5.5" text-anchor="middle" font-size="15" font-weight="700" fill="#FBF3E4">漏</text></g>`;
  }
  if (L.kind === "chip") {
    const txt = `${L.name} ${L.score}`, w = [...txt].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 15.5 : ch === " " ? 4.5 : 8.6), 0) + 34;
    return `<g transform="translate(${f1(L.x)},${f1(L.y)})"><rect x="${f1(-w / 2)}" y="-13" width="${f1(w)}" height="26" rx="13" fill="#FBF8F0" stroke="${L.leak ? SEAL : "#B9AC92"}" stroke-width="${L.leak ? 1.8 : 1}"${L.leak ? ' stroke-dasharray="4 3"' : ""}/>`
      + `<text x="0" y="5.5" text-anchor="middle" font-size="15" font-weight="700" fill="${INK}">${txt}</text></g>`
      + (L.leak ? `<g transform="translate(${f1(L.x + w / 2 + 16)},${f1(L.y)}) rotate(-6)"><rect x="-11" y="-11" width="22" height="22" rx="3" fill="${SEAL}" stroke="#FBF3E4" stroke-width="1.2"/><text x="0" y="5.5" text-anchor="middle" font-size="15" font-weight="700" fill="#FBF3E4">漏</text></g>` : "");
  }
  const s = L.size || 15;
  if (L.kind === "vlabel") {
    const chars = [...L.name], lh = s + 2, h = chars.length * lh + s + 6, top = L.y - h / 2;
    const body = (attrs) => chars.map((c, i) => `<text x="${f1(L.x)}" y="${f1(top + lh * (i + 0.82))}" text-anchor="middle" font-size="${s}" font-weight="700" ${attrs}>${c}</text>`).join("")
      + `<text x="${f1(L.x)}" y="${f1(top + chars.length * lh + s + 2)}" text-anchor="middle" font-size="${s + 1}" font-weight="700" ${attrs}>${L.score}</text>`;
    return `<g>${body(`fill="none" stroke="${HALO}" stroke-width="4" stroke-linejoin="round"`)}${body(`fill="${INK}"`)}</g>`;
  }
  const two = (attrs) => `<text x="${f1(L.x)}" y="${f1(L.y - 2)}" text-anchor="middle" font-size="${s}" font-weight="700" ${attrs}>${L.name}</text>`
    + `<text x="${f1(L.x)}" y="${f1(L.y + s)}" text-anchor="middle" font-size="${s - 1}" font-weight="600" ${attrs}>${L.score}</text>`;
  return `<g>${two(`fill="none" stroke="${HALO}" stroke-width="4" stroke-linejoin="round"`)}${two(`fill="${INK}"`)}</g>`;
}
export function sceneInnerSVG(scene) {
  let s = "";
  for (const o of scene.ops) {
    const pts = o.pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ");
    s += `<polygon points="${pts}" fill="${o.fill}"${o.glass ? ' fill-opacity=".5"' : ""}${o.fo ? ` fill-opacity="${o.fo}"` : ""}`
      + (o.stroke === "none" ? ' stroke="none"' : ` stroke="${o.stroke}" stroke-opacity="${o.so}" stroke-width="${o.sw}" stroke-linejoin="round"${o.dash ? ' stroke-dasharray="5 3"' : ""}`) + "/>";
  }
  for (const L of scene.labels) s += labelSVG(L);
  return s;
}
export function pyramidDescription(scores, total, lowest, DIM_ORDER) {
  return `珍爱金字塔（3D立体）：整体${total}分；` + DIM_ORDER.map((k) => `${DIMS[k].name}${scores[k]}分`).join("，") + `；最低为${DIMS[lowest].name}，是漏能量层`;
}
/** 完整 SVG 字符串。opts.font：导出用的显式字体；opts.size：[宽,高] 像素 */
export function pyramid3dSVG(scores, total, lowest, view = DEFAULT_VIEW, opts = {}) {
  const sc = buildScene(scores, total, lowest, view);
  const vb = VIEWBOX;
  const size = opts.size ? ` width="${opts.size[0]}" height="${opts.size[1]}"` : "";
  const font = opts.font ? ` font-family='${opts.font}'` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}"${size}${font}>${sceneInnerSVG(sc)}</svg>`;
}

/* ---------- 交互版（浏览器） ---------- */
export function mountPyramid3D(host, data, { reduced = false, label = "" } = {}) {
  const { scores, total, lowest } = data;
  const vb = VIEWBOX;
  host.innerHTML = `<svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><g class="scene"></g></svg>`;
  const g = host.querySelector(".scene");
  let yaw = DEFAULT_VIEW.yaw, pitch = DEFAULT_VIEW.pitch, dir = 1, idleUntil = 0, dragging = false, last = 0, visible = true, raf = 0, dirty = true;
  const clampYaw = (v) => Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, v));
  const draw = () => { g.innerHTML = sceneInnerSVG(buildScene(scores, total, lowest, { yaw, pitch })); dirty = false; };
  const tick = (now) => {
    if (!host.isConnected) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (!reduced && visible && !dragging && now > idleUntil) {
      yaw += dir * 7 * dt;
      if (Math.abs(yaw) > 34) { yaw = Math.sign(yaw) * 34; dir = -Math.sign(yaw); }
      dirty = true;
    }
    if (dirty && visible) draw();
  };
  draw();
  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  if (!reduced) start();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) dirty = true; }).observe(host);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (!reduced && host.isConnected) start(); });

  let sx = 0, sy = 0, y0 = 0, p0 = 0;
  host.addEventListener("pointerdown", (e) => {
    dragging = true; sx = e.clientX; sy = e.clientY; y0 = yaw; p0 = pitch;
    try { host.setPointerCapture(e.pointerId); } catch (_) {}
    host.classList.add("grabbing");
  });
  host.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw = clampYaw(y0 + (e.clientX - sx) * 0.45);
    if (e.pointerType === "mouse") pitch = Math.max(12, Math.min(40, p0 - (e.clientY - sy) * 0.25));
    dirty = true; if (reduced) draw();
  });
  const end = () => { if (!dragging) return; dragging = false; idleUntil = performance.now() + 3000; host.classList.remove("grabbing"); dir = yaw >= 0 ? -1 : 1; };
  host.addEventListener("pointerup", end); host.addEventListener("pointercancel", end);
  host.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault(); yaw = clampYaw(yaw + (e.key === "ArrowLeft" ? -8 : 8)); idleUntil = performance.now() + 4000; dirty = true; if (reduced) draw();
    }
  });
  return { setView(v) { yaw = clampYaw(v.yaw); if (v.pitch) pitch = v.pitch; idleUntil = performance.now() + 1e9; draw(); } };
}
