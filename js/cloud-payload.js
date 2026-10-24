/* 珍爱金字塔 · 云端协议。计分只调用 computeResult，这里不另写算法。
 *
 * assessmentId=zhenai，assessmentVersion=zhenai-h5-v1，
 * consent.version=consent-assessment-zhenai-1。
 * extensionData.answers 是题库顺序的 36 个整数 1–5（原始作答，含反向题原值）。
 * extensionData.score 是 computeResult 的快照：sums / scores / total / levels / lowest / highest / relations / weak。
 * 不上传 7 天打卡，也不上传任何练习手记。
 */
import { DIM_ORDER, DIMS, QUESTIONS } from "./data.js";
import { GENERIC_RELATION, RELATION_TEXT } from "./content.js";
import { openingText } from "./report.js";
import { computeResult } from "./scoring.js";

export const ASSESSMENT_ID = "zhenai";
export const ASSESSMENT_NAME = "珍爱金字塔";
export const ASSESSMENT_VERSION = "zhenai-h5-v1";
export const CONSENT_VERSION = "consent-assessment-zhenai-1";
export const SCHEMA_VERSION = "1.0.0";
export const SCREEN = "这是自我觉察，不是心理诊断，也不说明哪一层更好。";
export const READER_GAP = "阅读页若尚未重绘珍爱金字塔，六维分数、分级、最低层和关联在 extensionData.score 与 viewModel。";

function chars(value) {
  return Array.from(String(value == null ? "" : value));
}

export function zhenaiNickname(value) {
  const text = String(value == null ? "" : value).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim();
  return chars(text).slice(0, 12).join("");
}

export function phoneNickname(value) {
  const text = String(value == null ? "" : value);
  if (/(?:^|[^\d])1[3-9]\d{9}(?:$|[^\d])/.test(text)) return true;
  return /1[3-9]\d{9}/.test(text.replace(/\D/g, ""));
}

function likert(n) {
  return typeof n === "number" && Number.isFinite(n) && Math.round(n) === n && n >= 1 && n <= 5;
}

/* 题库顺序的 36 个原始分。不合格返回 null，调用方不得上传。 */
export function zhenaiAnswers(input) {
  if (QUESTIONS.length !== 36 || !Array.isArray(input) || input.length !== 36) return null;
  const list = [];
  for (let i = 0; i < 36; i++) {
    if (!likert(input[i])) return null;
    list.push(input[i]);
  }
  return list;
}

function levelSnap(level) {
  return { id: level.id, name: level.name, min: level.min, desc: level.desc };
}

export function scoreSnapshot(result) {
  const sums = {};
  const scores = {};
  const levels = {};
  for (const id of DIM_ORDER) {
    sums[id] = result.sums[id];
    scores[id] = result.scores[id];
    levels[id] = levelSnap(result.levels[id]);
  }
  return {
    sums,
    scores,
    total: result.total,
    levels,
    lowest: result.lowest,
    highest: result.highest,
    relations: result.relations.map((hit) => ({
      id: hit.id,
      dims: hit.dims.slice(),
      strength: hit.strength,
    })),
    weak: result.weak.slice(),
  };
}

function plainOpening(result) {
  return openingText(result).replace(/<\/?em>/g, "");
}

function dimensions(result) {
  return DIM_ORDER.map((id) => ({
    id,
    name: DIMS[id].name,
    kind: "score",
    score: result.scores[id],
    raw: result.sums[id],
    max: 100,
    level: result.levels[id].id,
    levelLabel: result.levels[id].name,
    narrative: DIMS[id].sub,
    labels: [],
  }));
}

function outcome(result) {
  const name = DIMS[result.lowest].name;
  return {
    headline: `最薄的一层是「${name}」`,
    code: result.lowest,
    label: name,
    summary: `${plainOpening(result)}${SCREEN}`,
    flags: [],
  };
}

function relationCopy(result) {
  const hits = result.relations.map((hit) => RELATION_TEXT[hit.id]).filter(Boolean);
  return hits.length ? hits : [GENERIC_RELATION];
}

function interpretation(result, score) {
  const head = outcome(result);
  const blocks = [
    { id: "verdict", title: head.headline, text: head.summary },
    { id: "screen", title: "不是诊断", text: SCREEN },
  ];
  for (const id of DIM_ORDER) {
    blocks.push({
      id,
      title: DIMS[id].name,
      text: `${score.scores[id]} 分 · ${score.levels[id].name}。${DIMS[id].sub}`,
    });
  }
  relationCopy(result).forEach((item, index) => {
    blocks.push({ id: `rel-${index}`, title: item.title, text: item.body });
  });
  return blocks;
}

function recommendations() {
  return [
    { id: "screen", title: null, text: SCREEN },
    { id: "reader", title: null, text: READER_GAP },
  ];
}

function sections(result, score) {
  const head = outcome(result);
  const lines = DIM_ORDER.map((id) => `${DIMS[id].name} ${score.scores[id]}`).join(" · ");
  const rel = relationCopy(result).map((item) => item.title).join("；");
  return [
    { t: "h", l: 2, x: head.headline },
    { t: "p", x: head.summary },
    { t: "p", x: SCREEN },
    { t: "p", x: lines },
    { t: "p", x: rel },
  ];
}

export function buildZhenaiResult(input) {
  input = input || {};
  const nickname = zhenaiNickname(input.nickname);
  if (!nickname || phoneNickname(input.nickname) || phoneNickname(nickname)) return null;
  if (!input.reportId || !input.clientSubmissionId || !input.completedAt) return null;
  const answers = zhenaiAnswers(input.answers);
  if (!answers) return null;
  let scored;
  try {
    scored = computeResult(answers);
  } catch {
    return null;
  }
  const score = scoreSnapshot(scored);
  const head = outcome(scored);
  const sectionList = sections(scored, score);
  return {
    reportId: input.reportId,
    assessmentId: ASSESSMENT_ID,
    assessmentName: ASSESSMENT_NAME,
    assessmentVersion: ASSESSMENT_VERSION,
    nickname,
    completedAt: input.completedAt,
    dimensions: dimensions(scored),
    result: head,
    interpretation: interpretation(scored, score),
    recommendations: recommendations(),
    reportContent: {
      format: "view-model+sections",
      viewModel: {
        answers: answers.slice(),
        sums: score.sums,
        scores: score.scores,
        total: score.total,
        levels: score.levels,
        lowest: score.lowest,
        highest: score.highest,
        relations: score.relations,
        weak: score.weak,
        rushed: false,
      },
      sections: sectionList,
      textFallback: sectionList.map((section) => section.x).join(""),
    },
    extensionData: {
      answers: answers.slice(),
      score,
      quality: { rushed: false },
      consent: {
        agreed: true,
        version: CONSENT_VERSION,
        at: input.completedAt,
        scopes: ["store", "share_link", "mentor_read"],
      },
      compat: { level: "partial", gaps: [READER_GAP] },
    },
    source: {
      site: ASSESSMENT_NAME,
      path: "index.html",
      repo: "zhenai-pyramid",
      origin: "external-repo",
      pageUrl: "https://xiangshu3721.github.io/zhenai-pyramid/",
      clientSubmissionId: input.clientSubmissionId,
      resultKitId: "zhenai",
      localKey: "zhenai-pyramid:v1",
    },
    schemaVersion: SCHEMA_VERSION,
  };
}
