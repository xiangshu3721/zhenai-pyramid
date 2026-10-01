// 纯函数计分逻辑：浏览器与 node 测试共用，不依赖 DOM。
import { DIMS, DIM_ORDER, QUESTIONS, LEVELS } from "./data.js";

export const LOW = 60; // <60 视为低
export const HIGH = 70; // ≥70 视为高

/** 单题得分：反向题 5→1, 4→2, 3 不变（即 6-x） */
export function itemScore(raw, reverse) {
  return reverse ? 6 - raw : raw;
}

/** 维度原始总分（6 题，满分 30） */
export function dimensionSum(answers, dim) {
  let sum = 0;
  QUESTIONS.forEach((qu, i) => {
    if (qu.dim === dim) sum += itemScore(answers[i], qu.reverse);
  });
  return sum;
}

/** 维度得分 = 总分 ÷ 30 × 100，四舍五入取整 */
export function toPercent(sum, max = 30) {
  return Math.round((sum / max) * 100);
}

export function levelOf(score) {
  return LEVELS.find((l) => score >= l.min);
}

/** 加权总分（权重为整数百分比，避免浮点误差） */
export function weightedTotal(scores) {
  let acc = 0;
  for (const k of DIM_ORDER) acc += scores[k] * DIMS[k].weight;
  return Math.round(acc / 100);
}

function pickBy(scores, better) {
  let best = null;
  for (const k of DIM_ORDER) {
    if (best === null) best = k;
    else if (scores[k] === scores[best]) {
      if (DIMS[k].weight > DIMS[best].weight) best = k; // 并列取权重更高者
    } else if (better(scores[k], scores[best])) best = k;
  }
  return best;
}
export const pickLowest = (scores) => pickBy(scores, (a, b) => a < b);
export const pickHighest = (scores) => pickBy(scores, (a, b) => a > b);

export function isComplete(answers) {
  return (
    Array.isArray(answers) &&
    answers.length === QUESTIONS.length &&
    answers.every((a) => Number.isInteger(a) && a >= 1 && a <= 5)
  );
}

/** 关联规则：返回命中的规则，按相关度排序，取最多 2 条 */
export function evaluateRelations(scores, answers, lowest) {
  const low = (k) => scores[k] < LOW;
  const high = (k) => scores[k] >= HIGH;
  const lowM = (k) => LOW - scores[k];
  const highM = (k) => scores[k] - HIGH;
  const hits = [];
  const add = (id, dims, strength) => hits.push({ id, dims, strength });

  if (low("A") && low("D")) add("A_low_D_low", ["A", "D"], (lowM("A") + lowM("D")) / 2);
  if (low("B") && low("C")) add("B_low_C_low", ["B", "C"], (lowM("B") + lowM("C")) / 2);
  if (low("E") && low("F")) add("E_low_F_low", ["E", "F"], (lowM("E") + lowM("F")) / 2);
  if (high("D") && low("A")) add("D_high_A_low", ["D", "A"], (highM("D") + lowM("A")) / 2);
  if (high("C") && low("E")) add("C_high_E_low", ["C", "E"], (highM("C") + lowM("E")) / 2);

  // 理解与边界：第31题高、第33–36题均分低
  const s = (n) => itemScore(answers[n - 1], QUESTIONS[n - 1].reverse);
  const q31 = s(31);
  const avgBoundary = (s(33) + s(34) + s(35) + s(36)) / 4;
  if (q31 >= 4 && avgBoundary < 3) {
    add("F_empathy_over_boundary", ["F"], (3 - avgBoundary) * 20 + (q31 - 4) * 10 + 1);
  }

  hits.sort((a, b) => {
    const ra = a.dims.includes(lowest) ? 1 : 0;
    const rb = b.dims.includes(lowest) ? 1 : 0;
    if (ra !== rb) return rb - ra;
    return b.strength - a.strength;
  });
  return hits.slice(0, 2);
}

export function computeResult(answers) {
  if (!isComplete(answers)) throw new Error("answers incomplete");
  const sums = {};
  const scores = {};
  for (const k of DIM_ORDER) {
    sums[k] = dimensionSum(answers, k);
    scores[k] = toPercent(sums[k]);
  }
  const lowest = pickLowest(scores);
  const highest = pickHighest(scores);
  const total = weightedTotal(scores);
  const levels = {};
  for (const k of DIM_ORDER) levels[k] = levelOf(scores[k]);
  const vals = DIM_ORDER.map((k) => scores[k]);
  const allEqual = Math.max(...vals) === Math.min(...vals);
  const relations = evaluateRelations(scores, answers, lowest);
  const weak = DIM_ORDER.filter((k) => scores[k] < LOW).sort(
    (a, b) => scores[a] - scores[b] || DIMS[b].weight - DIMS[a].weight
  );
  return { sums, scores, total, totalLevel: levelOf(total), levels, lowest, highest, allEqual, relations, weak };
}
