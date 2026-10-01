// 纯 SVG 自绘图表：六维雷达图 + 分级配色。珍爱金字塔 3D 见 pyramid3d.js。无任何外部库。
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
const f = (n) => Math.round(n * 10) / 10;

/* ---------------- 雷达图 ---------------- */
export function radarSVG(scores, lowest, highest, opts = {}) {
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
  const size = opts.size ? ` width="${opts.size[0]}" height="${opts.size[1]}"` : "";
  const font = opts.font ? `font-family='${opts.font}'` : 'font-family="inherit"';
  return `<svg viewBox="0 0 400 350"${size} role="img" aria-label="六维雷达图：${desc}" xmlns="http://www.w3.org/2000/svg" ${font}>${g}</svg>`;
}
