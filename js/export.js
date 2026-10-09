// 导出完整报告长图：纯 canvas 2D 手绘 + 内嵌 SVG（雷达图 / 3D 金字塔静态版）。
// 无外部库、无外部请求；不依赖 CSS 3D / foreignObject，iOS Safari、微信内置浏览器都能画。
import { pyramid3dSVG, DEFAULT_VIEW } from "./pyramid3d.js";
import { radarSVG, LEVEL_COLOR } from "./charts.js";

export const SERIF = '"Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC","Noto Serif SC","SimSun","Songti TC",serif';
export const SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const W = 750, M = 44, CW = W - M * 2;
const C = { paper: "#F3ECDD", paper2: "#EBE2CE", card: "#FBF8F0", ink: "#2A2521", ink2: "#5B5047", line: "#D9CDB4", ochre: "#A8741F", teal: "#4F6F6C", tealD: "#3A5A57", seal: "#A8432F" };
const TAGS = { good: ["#DCE8E3", "#2F5550"], leak: ["#F2D8CC", "#8A3320"], neutral: ["#EBE2CE", "#5B5047"] };
const NO_START = new Set("，。、；：？！）】》」』”’…·,.;:?!)".split(""));
const NO_END = new Set("（【《「『“‘(".split(""));

/* ---------- 文本排版 ---------- */
function parseRuns(html, base) {
  // 只支持 <em>…</em> 强调
  const runs = [];
  html.split(/(<em>.*?<\/em>)/g).forEach((p) => {
    if (!p) return;
    const m = p.match(/^<em>(.*?)<\/em>$/);
    runs.push(m ? { t: m[1], color: C.seal, bold: true } : { t: p, color: base });
  });
  return runs;
}
function tokens(runs) {
  const out = [];
  for (const r of runs) {
    const re = /[A-Za-z0-9.%+\-]+|[\s\S]/gu;
    for (const m of r.t.matchAll(re)) out.push({ s: m[0], color: r.color, bold: r.bold });
  }
  return out;
}
const fontOf = (px, bold, serif) => `${bold ? 700 : 400} ${px}px ${serif ? SERIF : SANS}`;

class Painter {
  constructor(ctx, draw) { this.c = ctx; this.draw = draw; this.cache = new Map(); }
  width(s, font) {
    const k = font + "|" + s; let w = this.cache.get(k);
    if (w === undefined) { this.c.font = font; w = this.c.measureText(s).width; this.cache.set(k, w); }
    return w;
  }
  /** 折行并（按需）绘制，返回结束 y。opts: x,w,size,lh,color,serif,bold,align */
  para(runsOrText, y, o = {}) {
    const x = o.x ?? M, w = o.w ?? CW, size = o.size ?? 23, lh = o.lh ?? Math.round(size * 1.78), serif = !!o.serif;
    const runs = typeof runsOrText === "string" ? parseRuns(runsOrText, o.color || C.ink) : runsOrText;
    const toks = tokens(runs.map((r) => ({ ...r, bold: r.bold ?? o.bold })));
    const lines = []; let cur = [], cw = 0;
    for (const t of toks) {
      const f = fontOf(size, t.bold, serif), tw = this.width(t.s, f) + (o.ls || 0) * [...t.s].length;
      if (t.s === "\n") { lines.push(cur); cur = []; cw = 0; continue; }
      if (cw + tw > w && cur.length && !NO_START.has(t.s)) {
        // 避头尾：行尾若是开括号，一并带到下一行
        let carry = [];
        while (cur.length > 1 && NO_END.has(cur[cur.length - 1].s)) carry.unshift(cur.pop());
        lines.push(cur); cur = carry; cw = carry.reduce((a, b) => a + b.w, 0);
      }
      cur.push({ ...t, w: tw, f }); cw += tw;
    }
    if (cur.length) lines.push(cur);
    if (this.draw) {
      const c = this.c; c.textBaseline = "alphabetic";
      lines.forEach((ln, i) => {
        const tot = ln.reduce((a, b) => a + b.w, 0);
        let px = o.align === "center" ? x + (w - tot) / 2 : o.align === "right" ? x + w - tot : x;
        const by = y + i * lh + (lh + size * 0.72) / 2 - size * 0.18;
        for (const t of ln) {
          c.font = t.f; c.fillStyle = t.color || o.color || C.ink;
          if (o.ls) { for (const ch of [...t.s]) { c.fillText(ch, px, by); px += this.width(ch, t.f) + o.ls; } } else { c.fillText(t.s, px, by); px += t.w; }
        }
      });
    }
    return y + lines.length * lh;
  }
  text(s, x, y, { size = 22, color = C.ink, bold = false, serif = false, align = "left" } = {}) {
    if (!this.draw) return;
    const c = this.c; c.font = fontOf(size, bold, serif); c.fillStyle = color; c.textAlign = align; c.textBaseline = "alphabetic";
    c.fillText(s, x, y); c.textAlign = "left";
  }
  rrect(x, y, w, h, r, { fill, stroke, lw = 1, dash } = {}) {
    if (!this.draw) return;
    const c = this.c; c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : rr(c, x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]); }
  }
}
function rr(c, x, y, w, h, r) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

/* ---------- 图像准备 ---------- */
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("图片加载失败")); im.src = src; });
}
const svgImage = (svg) => loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));

/* ---------- 版面 ---------- */
function section(p, y, title) {
  y += 44;
  if (p.draw) {
    const c = p.c; c.save(); c.translate(M + 7, y + 17); c.rotate(Math.PI / 4); c.fillStyle = C.seal; c.fillRect(-6, -6, 12, 12); c.restore();
  }
  p.text(title, M + 28, y + 27, { size: 30, bold: true, serif: true });
  return y + 54;
}
function tagChip(p, x, y, text, kind) {
  const [bg, fg] = TAGS[kind] || TAGS.neutral, f = fontOf(18, true, false), w = p.width(text, f) + 26;
  p.rrect(x, y, w, 30, 15, { fill: bg });
  p.text(text, x + 13, y + 22, { size: 18, bold: true, color: fg });
  return w;
}
/** 带卡片底的内容块；inner(p, y) → 结束 y */
function card(p, y, kind, inner) {
  const pad = 26, st = { leak: [ "#FBF1EA", "#D9A58F"], good: ["#F1F6F3", "#A9C4BB"] }[kind] || [C.card, C.line];
  const endMeasure = inner(new Painter(p.c, false), y + pad);
  const h = endMeasure - y + pad;
  p.rrect(x0(), y, CW, h, 22, { fill: st[0], stroke: st[1], lw: 1.5 });
  inner(p, y + pad);
  return y + h;
}
const x0 = () => M;
function cardTitle(p, y, title, tag, tagKind) {
  const f = fontOf(27, true, true);
  p.text(title, M + 26, y + 30, { size: 27, bold: true, serif: true });
  if (tag) {
    const tw = p.width(title, f);
    const tx = M + 26 + tw + 14;
    const w = p.width(tag, fontOf(18, true, false)) + 26;
    if (tx + w > M + CW - 20) { tagChip(p, M + 26, y + 42, tag, tagKind); return y + 90; }
    tagChip(p, tx, y + 5, tag, tagKind); 
  }
  return y + 50;
}

export async function renderReportImage(model, { date, scale = 2, view = DEFAULT_VIEW, nick = "" } = {}) {
  const [pyr, rad] = await Promise.all([
    svgImage(pyramid3dSVG(model.scores, model.total, model.lowest, view, { size: [640, 646], font: SANS })),
    svgImage(radarSVG(model.scores, model.lowest, model.highest, { size: [640, 560], font: SANS })),
  ]);
  const layout = (p) => {
    let y = 0;
    const c = p.c;
    // ---- 头部 ----
    y = 56;
    p.rrect(M, y, 34, 34, 6, { fill: C.seal }); p.text("爱", M + 17, y + 25, { size: 21, serif: true, color: "#FBF3E4", align: "center" });
    p.text("自我关系状态评估", M + 50, y + 25, { size: 21, color: C.ink2 });
    p.text(date, W - M, y + 25, { size: 20, color: C.ink2, align: "right" });
    y += 56;
    p.text("珍爱金字塔", M, y + 52, { size: 58, bold: true, serif: true });
    p.text("· 我的结果", M + 5 + p.width("珍爱金字塔", fontOf(58, true, true)), y + 52, { size: 30, serif: true, color: C.ink2 });
    y += 74;
    if (p.draw) { c.fillStyle = C.line; c.fillRect(M, y, CW, 2); c.fillStyle = C.seal; c.fillRect(M, y, 90, 2); }
    y += 28;
    p.text(`${nick || "匿名"} 的测评结果`, M, y + 26, { size: 28, bold: true, serif: true, color: C.seal });
    y += 52;
    y = p.para(model.title, y, { size: 36, bold: true, serif: true, lh: 54 });
    y += 14;
    y = p.para(model.opening, y, { size: 24, serif: true, lh: 44 });
    y += 14;
    {
      const t = `${model.totalLine.label} ${model.totalLine.value} · ${model.totalLine.level}`;
      const w = p.width(t, fontOf(21, true, false)) + 36;
      p.rrect(M, y, w, 44, 22, { fill: C.card, stroke: C.line, lw: 1.5 });
      p.text(t, M + 18, y + 30, { size: 21, bold: true });
      y += 58;
      y = p.para(model.totalLine.note, y, { size: 19, color: C.ink2, lh: 30 });
    }
    // ---- 金字塔 ----
    y = section(p, y, "珍爱金字塔");
    y = p.para(model.pyramid.cap, y, { size: 20, color: C.ink2, lh: 32 });
    y += 10;
    {
      const h = 646 + 100;
      p.rrect(M, y, CW, h, 26, { fill: C.card, stroke: C.line, lw: 1.5 });
      if (p.draw) c.drawImage(pyr, M + (CW - 640) / 2 + 3, y + 14, 640, 646);
      // 图例
      const items = model.pyramid.legend, f = fontOf(20, false, false);
      const ws = items.map((l) => 30 + p.width(l.name, f)), gap = 22, tot = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      let lx = M + (CW - tot) / 2; const ly = y + 14 + 646 + 28;
      items.forEach((l, i) => {
        p.rrect(lx, ly - 15, 18, 18, 4, { fill: LEVEL_COLOR[l.id], stroke: "rgba(0,0,0,.2)", lw: 1 });
        p.text(l.name, lx + 26, ly + 1, { size: 20, color: C.ink2 });
        lx += ws[i] + gap;
      });
      p.text("可左右拖动页面中的立体图查看不同角度", M + CW / 2, y + h - 22, { size: 17, color: "#8A7E70", align: "center" });
      y += h;
    }
    // ---- 雷达 ----
    y = section(p, y, "六个维度的轮廓");
    y = p.para(model.radar.cap, y, { size: 20, color: C.ink2, lh: 32 });
    y += 10;
    p.rrect(M, y, CW, 580, 26, { fill: C.card, stroke: C.line, lw: 1.5 });
    if (p.draw) c.drawImage(rad, M + (CW - 640) / 2, y + 10, 640, 560);
    y += 580;
    // ---- 资源/漏 ----
    y = section(p, y, "你的资源 · 你的漏能量层");
    for (const [kind, blk] of [["good", model.resource], ["leak", model.leak]]) {
      y = card(p, y, kind, (pp, yy) => {
        yy = cardTitle(pp, yy, blk.title, blk.tag, kind);
        blk.paras.forEach((t, i) => { yy = pp.para(t, yy + (i ? 8 : 0), { x: M + 26, w: CW - 52, size: 22, lh: 40 }); });
        return yy;
      });
      y += 18;
    }
    // ---- 关联 ----
    y = section(p, y, "它们之间的关联") ;
    for (const r of model.relations) {
      const y0 = y;
      y = p.para(r.title, y + 2, { x: M + 24, w: CW - 24, size: 24, bold: true, serif: true, color: C.ochre, lh: 36 });
      y = p.para(r.body, y + 4, { x: M + 24, w: CW - 24, size: 22, lh: 40 });
      if (p.draw) { c.fillStyle = C.ochre; c.fillRect(M, y0 + 4, 4, y - y0 - 8); }
      y += 18;
    }
    // ---- 接下来 ----
    y = section(p, y, "接下来怎么做");
    {
      const rec = model.recommendation;
      y = card(p, y, rec.kind === "plain" ? "" : rec.kind, (pp, yy) => {
        yy = cardTitle(pp, yy, rec.title, rec.tag, rec.tagClass);
        rec.paras.forEach((t, i) => { yy = pp.para(t, yy + (i ? 8 : 0), { x: M + 26, w: CW - 52, size: 22, lh: 40, bold: rec.boldFirst && i === 0 }); });
        return yy;
      });
      y += 18;
      const pr = model.practice;
      y = card(p, y, "", (pp, yy) => {
        yy = cardTitle(pp, yy, pr.title);
        yy = pp.para(pr.intro, yy, { x: M + 26, w: CW - 52, size: 22, lh: 40 });
        yy += 8;
        const sh = new Painter(pp.c, false).para(pr.sentence, yy + 18, { x: M + 44, w: CW - 88, size: 28, serif: true, lh: 50 }) + 18;
        pp.rrect(M + 26, yy, CW - 52, sh - yy, 16, { fill: C.paper2, stroke: "#B9AC92", lw: 1.5, dash: [6, 5] });
        pp.para(pr.sentence, yy + 18, { x: M + 44, w: CW - 88, size: 28, serif: true, lh: 50 });
        yy = sh + 14;
        yy = pp.para(pr.how, yy, { x: M + 26, w: CW - 52, size: 22, lh: 40 });
        yy += 16;
        const gw = (CW - 52 - 6 * 10) / 7;
        for (let d = 1; d <= 7; d++) {
          const dx = M + 26 + (d - 1) * (gw + 10), on = pr.done.includes(d);
          pp.rrect(dx, yy, gw, 74, 16, { fill: on ? C.tealD : "transparent", stroke: on ? C.tealD : C.ink2, lw: 1.5 });
          pp.text(String(d), dx + gw / 2, yy + 38, { size: 28, serif: true, bold: true, color: on ? "#FBF8F0" : C.ink, align: "center" });
          pp.text("天", dx + gw / 2, yy + 63, { size: 18, color: on ? "#FBF8F0" : C.ink2, align: "center" });
        }
        yy += 74 + 14;
        return pp.para(pr.note, yy, { x: M + 26, w: CW - 52, size: 18, color: C.ink2, lh: 28 });
      });
      y += 4;
    }
    // ---- 明细 ----
    y = section(p, y, "六个维度明细");
    for (const d of model.dims) {
      y = card(p, y, "", (pp, yy) => {
        pp.text(d.name, M + 26, yy + 30, { size: 26, bold: true, serif: true, color: d.leak ? C.seal : C.ink });
        pp.text(`${d.score} 分 · ${d.levelName}`, M + CW - 26, yy + 30, { size: 20, color: C.ink2, align: "right" });
        yy += 46;
        pp.rrect(M + 26, yy, CW - 52, 14, 7, { fill: C.paper2 });
        pp.rrect(M + 26, yy, Math.max(14, (CW - 52) * d.score / 100), 14, 7, { fill: LEVEL_COLOR[d.levelId] });
        yy += 24;
        return pp.para(`${d.sub}　${d.desc}`, yy, { x: M + 26, w: CW - 52, size: 19, color: C.ink2, lh: 32 });
      });
      y += 14;
    }
    // ---- 尾部 ----
    for (const t of model.footer) y = p.para(t, y + 6, { size: 19, color: C.ink2, lh: 32, align: "center" });
    y += 18;
    p.text(`生成于 ${date} · 珍爱金字塔`, W / 2, y + 18, { size: 17, color: "#8A7E70", align: "center" });
    y += 62;
    return y;
  };

  // 先量高度
  const probe = document.createElement("canvas").getContext("2d");
  const H = Math.ceil(layout(new Painter(probe, false)));
  let s = scale;
  const MAXPIX = 16000000; // iOS 老机型画布上限约 16.7M 像素
  if (W * s * H * s > MAXPIX) s = Math.max(1, Math.sqrt(MAXPIX / (W * H)));
  const cv = document.createElement("canvas");
  cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const ctx = cv.getContext("2d");
  ctx.scale(s, s);
  // 宣纸底 + 淡晕染
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 0.9); g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.min(H, 900));
  g = ctx.createRadialGradient(W, H, 0, W, H, W * 0.9); g.addColorStop(0, "rgba(168,116,31,.08)"); g.addColorStop(1, "rgba(168,116,31,0)");
  ctx.fillStyle = g; ctx.fillRect(0, Math.max(0, H - 1200), W, 1200);
  ctx.strokeStyle = "rgba(168,116,31,.35)"; ctx.lineWidth = 2; ctx.strokeRect(14, 14, W - 28, H - 28);
  layout(new Painter(ctx, true));
  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  return { blob: blob || null, dataURL: blob ? null : cv.toDataURL("image/png"), width: cv.width, height: cv.height, scale: s };
}

export function fmtDate(d = new Date()) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
export const fileNameFor = (d = new Date()) => `珍爱金字塔-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.png`;
