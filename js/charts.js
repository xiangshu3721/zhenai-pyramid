// 纯 SVG 自绘图表：六维雷达图 + 珍爱金字塔结构图。无任何外部库。
import { DIMS, DIM_ORDER } from "./data.js";
import { levelOf } from "./scoring.js";

const INK = "#2A2521";
const SOFT = "#6A5F55";
const PAPER = "#EFE6D3";
const SEAL = "#A8432F";
export const LEVEL_COLOR = {
  stable: "#8DB1A9", // 青
  usable: "#BBD0C3", // 淡青
  repair: "#E2C08D", // 淡赭
  care: "#D89B7D", // 赭红
};
const colorOf = (s) => LEVEL_COLOR[levelOf(s).id];
const f = (n) => Math.round(n * 10) / 10;

/* ---------------- 雷达图 ---------------- */
export function radarSVG(scores, lowest, highest) {
  const cx = 200, cy = 172, R = 100;
  const ang = (i) => ((-90 + i * 60) * Math.PI) / 180;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 100), cy + Math.sin(ang(i)) * R * (v / 100)];
  let g = "";
  for (const lv of [20, 40, 60, 80, 100]) {
    const pts = DIM_ORDER.map((_, i) => pt(i, lv).map(f).join(",")).join(" ");
    g += `<polygon points="${pts}" fill="none" stroke="${lv === 60 ? "#B79B6E" : "#CFC3AA"}" stroke-width="${lv === 60 ? 1.1 : 0.8}" ${lv === 60 ? 'stroke-dasharray="3 3"' : ""}/>`;
  }
  DIM_ORDER.forEach((_, i) => {
    const [x, y] = pt(i, 100);
    g += `<line x1="${cx}" y1="${cy}" x2="${f(x)}" y2="${f(y)}" stroke="#D8CDB6" stroke-width="0.8"/>`;
  });
  const poly = DIM_ORDER.map((k, i) => pt(i, scores[k]).map(f).join(",")).join(" ");
  g += `<polygon points="${poly}" fill="rgba(93,122,120,0.28)" stroke="#4F6F6C" stroke-width="2" stroke-linejoin="round"/>`;
  DIM_ORDER.forEach((k, i) => {
    const [x, y] = pt(i, scores[k]);
    const isLow = k === lowest, isHigh = k === highest;
    const col = isLow ? SEAL : isHigh ? "#3F6B66" : "#4F6F6C";
    g += `<circle cx="${f(x)}" cy="${f(y)}" r="${isLow || isHigh ? 5.5 : 3.5}" fill="${isLow || isHigh ? col : "#FBF8F0"}" stroke="${col}" stroke-width="2"/>`;
    const lx = cx + Math.cos(ang(i)) * (R + 16), ly = cy + Math.sin(ang(i)) * (R + 16);
    const c = Math.cos(ang(i));
    const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
    const dy = Math.sin(ang(i)) < -0.5 ? -14 : Math.sin(ang(i)) > 0.5 ? 6 : -6;
    g += `<text x="${f(lx)}" y="${f(ly + dy)}" text-anchor="${anchor}" font-size="13" fill="${INK}" font-weight="${isLow ? 700 : 500}">${DIMS[k].name}</text>`;
    g += `<text x="${f(lx)}" y="${f(ly + dy + 15)}" text-anchor="${anchor}" font-size="12" fill="${isLow ? SEAL : SOFT}" font-weight="600">${scores[k]}${isLow ? " · 漏" : ""}</text>`;
  });
  const desc = DIM_ORDER.map((k) => `${DIMS[k].name}${scores[k]}分`).join("，");
  return `<svg viewBox="0 0 400 350" role="img" aria-label="六维雷达图：${desc}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">${g}</svg>`;
}

/* ---------------- 金字塔结构图 ---------------- */
export function pyramidSVG(scores, total, lowest) {
  const cx = 200, apexY = 62, baseY = 332, halfBase = 142;
  const hw = (y) => (halfBase * (y - apexY)) / (baseY - apexY);
  const poly = (pts) => pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");
  const layers = [];

  // 顶端：珍爱（整体加权总分）
  layers.push({ id: "top", name: "珍爱", score: total, y1: apexY, y2: 140, dim: null,
    pts: [[cx, apexY], [cx + hw(140), 140], [cx - hw(140), 140]], tx: cx, ty: 120, sealAt: null, small: true });
  // 核心：允许接纳
  layers.push({ id: "A", name: DIMS.A.name, score: scores.A, y1: 144, y2: 228, dim: "A",
    pts: [[cx - hw(144), 144], [cx + hw(144), 144], [cx + hw(228), 228], [cx - hw(228), 228]],
    tx: cx, ty: 183, sealAt: [cx + 52, 213] });
  // 四根支柱：有序性 / 平和性 / 自聚性 / 积极性
  const pillars = ["C", "E", "B", "D"];
  const y1 = 232, y2 = baseY, g = 2.5;
  pillars.forEach((k, i) => {
    const tl = cx - hw(y1) + (2 * hw(y1) * i) / 4 + (i > 0 ? g : 0);
    const tr = cx - hw(y1) + (2 * hw(y1) * (i + 1)) / 4 - (i < 3 ? g : 0);
    const bl = cx - hw(y2) + (2 * hw(y2) * i) / 4 + (i > 0 ? g : 0);
    const br = cx - hw(y2) + (2 * hw(y2) * (i + 1)) / 4 - (i < 3 ? g : 0);
    const mid = (tl + tr + bl + br) / 4;
    layers.push({ id: k, name: DIMS[k].name, score: scores[k], y1, y2, dim: k,
      pts: [[tl, y1], [tr, y1], [br, y2], [bl, y2]], tx: mid, ty: 274, sealAt: [(bl + br) / 2, 319], pillar: true });
  });

  let defs = "", body = "";
  // 外圈：理解与边界
  const ringS = scores.F;
  const ringPath = "M200,400 A205,195 0 1 1 200,10 A205,195 0 1 1 200,400";
  body += `<path d="${ringPath}" pathLength="100" fill="none" stroke="#E4D9C0" stroke-width="10"/>`;
  body += `<path d="${ringPath}" pathLength="100" fill="none" stroke="${colorOf(ringS)}" stroke-width="10" stroke-dasharray="${ringS} ${100 - ringS}"/>`;
  body += `<path d="${ringPath}" pathLength="100" fill="none" stroke="${INK}" stroke-opacity="0.25" stroke-width="0.8" transform="translate(0,0)"/>`;
  const ringLow = lowest === "F";
  body += `<rect x="118" y="387" width="164" height="26" rx="13" fill="#FBF8F0" stroke="${ringLow ? SEAL : "#B9AC92"}" stroke-width="${ringLow ? 1.6 : 1}" ${ringLow ? 'stroke-dasharray="4 3"' : ""}/>`;
  body += `<text x="200" y="404.5" text-anchor="middle" font-size="13" fill="${INK}" font-weight="600">理解与边界 ${ringS}</text>`;
  if (ringLow) body += seal(300, 400);

  for (const L of layers) {
    const h = L.y2 - L.y1;
    const fy = L.y2 - (h * L.score) / 100;
    const col = colorOf(L.score);
    defs += `<clipPath id="pc-${L.id}"><polygon points="${poly(L.pts)}"/></clipPath>`;
    body += `<g>`;
    body += `<polygon points="${poly(L.pts)}" fill="${PAPER}"/>`;
    body += `<rect x="0" y="${f(fy)}" width="400" height="${f(L.y2 - fy + 1)}" fill="${col}" clip-path="url(#pc-${L.id})"/>`;
    const isLow = L.dim && L.dim === lowest;
    body += `<polygon points="${poly(L.pts)}" fill="none" stroke="${isLow ? SEAL : INK}" stroke-opacity="${isLow ? 1 : 0.55}" stroke-width="${isLow ? 2.2 : 1}" ${isLow ? 'stroke-dasharray="5 3"' : ""} stroke-linejoin="round"/>`;
    body += `</g>`;
    const fs = L.small ? 14 : L.pillar ? 12 : 14;
    body += `<text x="${f(L.tx)}" y="${L.ty}" text-anchor="middle" font-size="${fs}" fill="${INK}" font-weight="700">${L.name}</text>`;
    body += `<text x="${f(L.tx)}" y="${L.ty + (L.small ? 14 : 19)}" text-anchor="middle" font-size="${L.small ? 11 : 13}" fill="${INK}" fill-opacity="0.8">${L.score}</text>`;
    if (isLow && L.sealAt) body += seal(L.sealAt[0], L.sealAt[1]);
  }
  const desc = `珍爱金字塔：整体${total}分；` + DIM_ORDER.map((k) => `${DIMS[k].name}${scores[k]}分`).join("，") + `；最低为${DIMS[lowest].name}，是漏能量层`;
  return `<svg viewBox="-20 0 440 425" role="img" aria-label="${desc}" xmlns="http://www.w3.org/2000/svg" font-family="inherit"><defs>${defs}</defs>${body}</svg>`;
}

function seal(x, y) {
  return `<g transform="translate(${f(x)},${f(y)})"><rect x="-10" y="-10" width="20" height="20" rx="3" fill="${SEAL}"/><text x="0" y="5" text-anchor="middle" font-size="13" font-weight="700" fill="#FBF3E4">漏</text></g>`;
}
