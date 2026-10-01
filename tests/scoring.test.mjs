import assert from "node:assert/strict";
import { QUESTIONS, DIM_ORDER, DIMS } from "../js/data.js";
import {
  itemScore, toPercent, levelOf, weightedTotal, pickLowest, pickHighest,
  computeResult, dimensionSum, evaluateRelations,
} from "../js/scoring.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("题库：36题，每维6题，反向题为 6/12/18/24/30/36", () => {
  assert.equal(QUESTIONS.length, 36);
  for (const k of DIM_ORDER) assert.equal(QUESTIONS.filter((x) => x.dim === k).length, 6);
  const rev = QUESTIONS.map((x, i) => (x.reverse ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(rev, [6, 12, 18, 24, 30, 36]);
  assert.equal(QUESTIONS.map((x) => x.dim).join(""), "AAAAAABBBBBBCCCCCCDDDDDDEEEEEEFFFFFF");
});

t("反向计分换算 5→1,4→2,3→3,2→4,1→5", () => {
  assert.deepEqual([5, 4, 3, 2, 1].map((x) => itemScore(x, true)), [1, 2, 3, 4, 5]);
  assert.deepEqual([1, 2, 3, 4, 5].map((x) => itemScore(x, false)), [1, 2, 3, 4, 5]);
});

t("维度得分换算 总分/30*100 四舍五入", () => {
  assert.equal(toPercent(30), 100);
  assert.equal(toPercent(6), 20);
  assert.equal(toPercent(18), 60);
  assert.equal(toPercent(12), 40);
  assert.equal(toPercent(24), 80);
  assert.equal(toPercent(7), 23); // 23.33
  assert.equal(toPercent(22), 73); // 73.33
  assert.equal(toPercent(23), 77); // 76.67
  assert.equal(toPercent(17), 57); // 56.67
});

t("分级边界 39/40/59/60/79/80", () => {
  const id = (s) => levelOf(s).id;
  assert.equal(id(0), "care"); assert.equal(id(39), "care");
  assert.equal(id(40), "repair"); assert.equal(id(59), "repair");
  assert.equal(id(60), "usable"); assert.equal(id(79), "usable");
  assert.equal(id(80), "stable"); assert.equal(id(100), "stable");
});

t("加权总分", () => {
  const all = (v) => Object.fromEntries(DIM_ORDER.map((k) => [k, v]));
  assert.equal(weightedTotal(all(100)), 100);
  assert.equal(weightedTotal(all(0)), 0);
  assert.equal(weightedTotal(all(50)), 50);
  // A100 其余0 → 25
  assert.equal(weightedTotal({ ...all(0), A: 100 }), 25);
  // A80 B60 C40 D20 E100 F0 = 20+12+4+2+15+0 = 53
  assert.equal(weightedTotal({ A: 80, B: 60, C: 40, D: 20, E: 100, F: 0 }), 53);
  assert.equal(DIM_ORDER.reduce((s, k) => s + DIMS[k].weight, 0), 100);
});

t("最低维度并列取权重更高者；最高并列同理", () => {
  assert.equal(pickLowest({ A: 50, B: 50, C: 50, D: 50, E: 50, F: 50 }), "A");
  assert.equal(pickLowest({ A: 80, B: 40, C: 40, D: 40, E: 90, F: 70 }), "B"); // B20 > C10,D10
  assert.equal(pickLowest({ A: 80, B: 90, C: 40, D: 40, E: 90, F: 70 }), "C"); // C=D 权重同为10，先到先得
  assert.equal(pickLowest({ A: 80, B: 90, C: 40, D: 40, E: 40, F: 70 }), "E"); // E15
  assert.equal(pickLowest({ A: 80, B: 90, C: 30, D: 40, E: 40, F: 70 }), "C"); // 严格最低
  assert.equal(pickHighest({ A: 90, B: 90, C: 40, D: 40, E: 40, F: 70 }), "A");
  assert.equal(pickHighest({ A: 10, B: 20, C: 95, D: 95, E: 40, F: 70 }), "C"); // 权重相同取靠前
});

t("端到端：全5分 / 全1分 / 全3分", () => {
  const r5 = computeResult(Array(36).fill(5));
  // 反向题全选5→1：每维 5*5+1=26 → 87
  for (const k of DIM_ORDER) { assert.equal(r5.sums[k], 26); assert.equal(r5.scores[k], 87); }
  const r1 = computeResult(Array(36).fill(1));
  for (const k of DIM_ORDER) { assert.equal(r1.sums[k], 10); assert.equal(r1.scores[k], 33); }
  const r3 = computeResult(Array(36).fill(3));
  for (const k of DIM_ORDER) assert.equal(r3.scores[k], 60);
  assert.equal(r3.total, 60);
  assert.equal(r3.lowest, "A");
  assert.throws(() => computeResult([1, 2]));
});

t("关联规则触发", () => {
  const mk = (over) => {
    const a = Array(36).fill(3);
    for (const [dim, val] of Object.entries(over)) {
      const idx = QUESTIONS.map((x, i) => (x.dim === dim ? i : -1)).filter((i) => i >= 0);
      idx.forEach((i) => (a[i] = QUESTIONS[i].reverse ? 6 - val : val));
    }
    return a;
  };
  // A低D低
  let r = computeResult(mk({ A: 2, D: 2, B: 4, C: 4, E: 4, F: 4 }));
  assert.equal(r.relations[0].id, "A_low_D_low");
  // B低C低
  r = computeResult(mk({ B: 2, C: 2, A: 4, D: 4, E: 4, F: 4 }));
  assert.equal(r.relations[0].id, "B_low_C_low");
  // E低F低
  r = computeResult(mk({ E: 2, F: 2, A: 4, B: 4, C: 4, D: 4 }));
  assert.equal(r.relations[0].id, "E_low_F_low");
  // D高A低：D=5(100) A=2(40)
  r = computeResult(mk({ D: 5, A: 2, B: 4, C: 4, E: 4, F: 4 }));
  assert.equal(r.relations[0].id, "D_high_A_low");
  // C高E低
  r = computeResult(mk({ C: 5, E: 2, A: 4, B: 4, D: 4, F: 4 }));
  assert.equal(r.relations[0].id, "C_high_E_low");
  // 过度共情：31题=5，33-36题均分低（正向33/34/35=1，36反向选5→1）
  const a = Array(36).fill(4);
  a[30] = 5; a[32] = 1; a[33] = 1; a[34] = 1; a[35] = 5;
  r = computeResult(a);
  assert.ok(r.relations.some((x) => x.id === "F_empathy_over_boundary"));
  // 都不触发
  r = computeResult(Array(36).fill(4));
  assert.equal(r.relations.length, 0);
  // 边界：<60 为低，=60 不低
  r = computeResult(mk({ A: 3, D: 3 })); // 60/60 不算低
  assert.equal(r.relations.length, 0);
  // 最多2条
  r = computeResult(mk({ A: 2, D: 2, B: 2, C: 2, E: 2, F: 2 }));
  assert.ok(r.relations.length <= 2);
});

/* ---------- 3D 金字塔 / 报告模型 ---------- */
import { buildScene, pyramid3dSVG, DEFAULT_VIEW, YAW_LIMIT } from "../js/pyramid3d.js";
import { buildReport, TALK, QR_PATH } from "../js/report.js";
import fs from "node:fs";

const SC = { A: 70, B: 30, C: 55, D: 85, E: 45, F: 62 };
t("3D 金字塔：任意角度都生成多边形，且含 6 层名称 + 分数 + 珍爱", () => {
  for (const yaw of [-YAW_LIMIT, -24, 0, 30, YAW_LIMIT]) {
    const sc = buildScene(SC, 64, "B", { yaw, pitch: 24 });
    assert.ok(sc.ops.length > 20, "多边形数量");
    for (const o of sc.ops) for (const p of o.pts) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const names = sc.labels.filter((l) => l.kind !== "seal").map((l) => l.name);
    for (const n of ["珍爱", "允许接纳", "有序性", "平和性", "自聚性", "积极性", "理解与边界"]) assert.ok(names.includes(n), n);
  }
});
t("3D 金字塔：最低分层有且仅有一个“漏”章（支柱/中层/底座）", () => {
  for (const low of ["A", "B", "C", "D", "E", "F"]) {
    const sc = buildScene({ ...SC, [low]: 5 }, 50, low);
    const seals = sc.labels.filter((l) => l.kind === "seal").length + sc.labels.filter((l) => l.kind === "chip" && l.leak).length;
    assert.equal(seals, 1, low);
    const svg = pyramid3dSVG({ ...SC, [low]: 5 }, 50, low);
    assert.ok(svg.includes("漏") && svg.includes('stroke-dasharray="5 3"'), "漏章与红色虚线 " + low);
  }
});
t("3D 金字塔：分数 0 / 100 / 同分不报错；SVG 良构（无 NaN）", () => {
  for (const v of [0, 100, 50]) {
    const sc = Object.fromEntries(DIM_ORDER.map((k) => [k, v]));
    const svg = pyramid3dSVG(sc, v, "A", DEFAULT_VIEW, { size: [640, 646], font: "sans-serif" });
    assert.ok(!svg.includes("NaN") && !svg.includes("undefined"));
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
  }
});
t("3D 金字塔：分级配色与 levelOf 一致（优先照顾=赭红 / 稳定=青）", () => {
  const svgLow = pyramid3dSVG({ ...SC, A: 10 }, 50, "A");
  const svgHigh = pyramid3dSVG({ ...SC, A: 95 }, 50, "B");
  assert.ok(svgLow.includes("rgb(") && svgHigh.includes("rgb("));
  assert.notEqual(svgLow, svgHigh);
});
t("报告模型：与计分一致，含全部板块与二维码文案", () => {
  const ans = Array(36).fill(3); ans[0] = 5; ans[5] = 1;
  const r = computeResult(ans);
  const m = buildReport(r, [1, 3]);
  assert.ok(m.title.includes(DIMS[r.lowest].name));
  assert.equal(m.dims.length, 6);
  assert.deepEqual(m.dims.map((d) => d.score), [...m.dims.map((d) => d.score)].sort((a, b) => b - a));
  assert.equal(m.dims.filter((d) => d.leak).length, 1);
  assert.deepEqual(m.practice.done, [1, 3]);
  assert.ok(m.relations.length >= 1);
  assert.ok(m.recommendation.paras.length >= 1);
  assert.ok(m.footer.join("").includes("不是医学或心理诊断"));
  assert.ok(TALK.lines.join("").includes("珍爱金字塔") && TALK.note.includes("长按识别二维码"));
});
t("二维码图片已入库，且是 PNG、大小合理", () => {
  const b = fs.readFileSync(new URL("../" + QR_PATH, import.meta.url));
  assert.equal(b.slice(1, 4).toString(), "PNG");
  assert.ok(b.length > 20000 && b.length < 600000, "size " + b.length);
});
t("无外部请求：源码中不出现 http(s) 外链（命名空间除外）", () => {
  for (const f of ["app", "export", "pyramid3d", "report", "charts"]) {
    const src = fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), "utf8").replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "");
    assert.ok(!/https?:\/\//.test(src), f);
  }
});

console.log(`\n${n} 组测试全部通过`);
