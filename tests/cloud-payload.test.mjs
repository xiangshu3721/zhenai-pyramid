import assert from "node:assert/strict";
import test from "node:test";
import { QUESTIONS } from "../js/data.js";
import { computeResult } from "../js/scoring.js";
import {
  ASSESSMENT_ID,
  ASSESSMENT_NAME,
  ASSESSMENT_VERSION,
  CONSENT_VERSION,
  SCHEMA_VERSION,
  SCREEN,
  buildZhenaiResult,
  phoneNickname,
  scoreSnapshot,
  zhenaiNickname,
} from "../js/cloud-payload.js";

const MARK = "SECRET_JOURNAL_9f3c";

function base(extra) {
  return {
    nickname: "林深",
    reportId: "rpt_abcdefghijk",
    clientSubmissionId: "sub_abcdefghijklmnop",
    completedAt: "2026-10-24T09:30:00+08:00",
    ...extra,
  };
}

function pattern(seed = 0) {
  return Array.from({ length: 36 }, (_, index) => ((index + seed) % 5) + 1);
}

function keysOf(value, found = []) {
  if (!value || typeof value !== "object") return found;
  const keys = Array.isArray(value) ? [] : Object.keys(value);
  for (const key of keys) {
    found.push(key);
    keysOf(value[key], found);
  }
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  return found;
}

test("称呼取前 12 个字，手机号和坏作答不上传", () => {
  assert.equal(zhenaiNickname("  林深  "), "林深");
  assert.equal(zhenaiNickname(`${"林深".repeat(6)}尾`), "林深".repeat(6));
  assert.equal(zhenaiNickname("   "), "");
  assert.equal(phoneNickname("13800000000"), true);
  assert.equal(phoneNickname("+86 138-0000-0000"), true);
  assert.equal(phoneNickname("林深"), false);
  const answers = pattern(0);
  assert.equal(buildZhenaiResult(base({ nickname: "  ", answers })), null);
  assert.equal(buildZhenaiResult(base({ nickname: "13800000000", answers })), null);
  assert.equal(buildZhenaiResult(base({ nickname: "138-0000-0000", answers })), null);
  assert.equal(buildZhenaiResult(base({ answers: pattern(0).slice(0, 35) })), null);
  assert.equal(buildZhenaiResult(base({ answers: pattern(0).concat(3) })), null);
  assert.equal(buildZhenaiResult(base({ answers, reportId: "" })), null);
  assert.equal(buildZhenaiResult(base({ answers, clientSubmissionId: "" })), null);
  assert.equal(buildZhenaiResult(base({ answers, completedAt: "" })), null);
  const bad = pattern(1);
  bad[4] = 0;
  assert.equal(buildZhenaiResult(base({ answers: bad })), null);
  bad[4] = 6;
  assert.equal(buildZhenaiResult(base({ answers: bad })), null);
  bad[4] = 1.5;
  assert.equal(buildZhenaiResult(base({ answers: bad })), null);
  bad[4] = "3";
  assert.equal(buildZhenaiResult(base({ answers: bad })), null);
  const withNull = pattern(2);
  withNull[7] = null;
  assert.equal(buildZhenaiResult(base({ answers: withNull })), null);
});

test("上传体的分数快照来自 computeResult，原始分不改反向题", () => {
  const cases = [pattern(0), pattern(2), Array(36).fill(5), Array(36).fill(1), Array(36).fill(3)];
  for (const answers of cases) {
    const live = computeResult(answers);
    const report = buildZhenaiResult(base({
      nickname: `${"林深".repeat(6)}多余`,
      answers,
      practice: [1, 3, MARK],
      journal: MARK,
      note: MARK,
      result: { total: 1, lowest: "F", scores: { A: 1 } },
    }));
    const snap = scoreSnapshot(live);
    assert.equal(report.nickname, "林深".repeat(6));
    assert.deepEqual(report.extensionData.answers, answers);
    assert.deepEqual(report.reportContent.viewModel.answers, answers);
    assert.equal(report.extensionData.answers.length, 36);
    report.extensionData.answers.forEach((value) => {
      assert.equal(Number.isInteger(value), true);
      assert.equal(value >= 1 && value <= 5, true);
    });
    assert.deepEqual(report.extensionData.score, snap);
    assert.deepEqual(report.extensionData.score.sums, live.sums);
    assert.deepEqual(report.extensionData.score.scores, live.scores);
    assert.equal(report.extensionData.score.total, live.total);
    assert.equal(report.extensionData.score.lowest, live.lowest);
    assert.equal(report.extensionData.score.highest, live.highest);
    assert.deepEqual(report.extensionData.score.weak, live.weak);
    assert.deepEqual(report.extensionData.score.relations, live.relations.map((hit) => ({
      id: hit.id,
      dims: hit.dims.slice(),
      strength: hit.strength,
    })));
    for (const id of ["A", "B", "C", "D", "E", "F"]) {
      assert.deepEqual(report.extensionData.score.levels[id], {
        id: live.levels[id].id,
        name: live.levels[id].name,
        min: live.levels[id].min,
        desc: live.levels[id].desc,
      });
    }
    assert.deepEqual(report.reportContent.viewModel.scores, live.scores);
    assert.equal(report.reportContent.viewModel.total, live.total);
    assert.notEqual(report.extensionData.score.total, 1);
    assert.deepEqual(report.dimensions.map((item) => item.id), ["A", "B", "C", "D", "E", "F"]);
    assert.deepEqual(report.dimensions.map((item) => item.score), ["A", "B", "C", "D", "E", "F"].map((id) => live.scores[id]));
    assert.deepEqual(report.dimensions.map((item) => item.raw), ["A", "B", "C", "D", "E", "F"].map((id) => live.sums[id]));
    const packed = JSON.stringify(report);
    assert.equal(packed.includes(MARK), false);
    assert.equal(packed.includes(QUESTIONS[5].text), false);
    assert.equal(packed.includes("只有足够优秀"), false);
  }
});

test("全选 5 分时反向题仍按原值上传，维度总分由 computeResult 处理", () => {
  const answers = Array(36).fill(5);
  const live = computeResult(answers);
  const report = buildZhenaiResult(base({ answers }));
  assert.equal(report.extensionData.answers[5], 5);
  assert.equal(report.extensionData.answers[11], 5);
  assert.equal(live.sums.A, 26);
  assert.equal(report.extensionData.score.sums.A, 26);
  assert.equal(report.dimensions[0].raw, 26);
  assert.equal(report.dimensions[0].score, live.scores.A);
});

test("协议标识、同意字段和没有打卡手记", () => {
  const answers = pattern(4);
  const report = buildZhenaiResult(base({ answers, practice: [2, 4], journal: "今天写了很长一段话" }));
  assert.equal(report.assessmentId, "zhenai");
  assert.equal(report.assessmentId, ASSESSMENT_ID);
  assert.equal(report.assessmentName, "珍爱金字塔");
  assert.equal(report.assessmentName, ASSESSMENT_NAME);
  assert.equal(report.assessmentVersion, "zhenai-h5-v1");
  assert.equal(report.assessmentVersion, ASSESSMENT_VERSION);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(report.source.resultKitId, "zhenai");
  assert.equal(report.source.repo, "zhenai-pyramid");
  assert.equal(report.source.path, "index.html");
  assert.equal(report.source.origin, "external-repo");
  assert.equal(report.source.pageUrl, "https://xiangshu3721.github.io/zhenai-pyramid/");
  assert.equal(report.source.localKey, "zhenai-pyramid:v1");
  assert.equal(report.extensionData.consent.agreed, true);
  assert.equal(report.extensionData.consent.version, CONSENT_VERSION);
  assert.equal(report.extensionData.consent.version, "consent-assessment-zhenai-1");
  assert.deepEqual(report.extensionData.consent.scopes, ["store", "share_link", "mentor_read"]);
  assert.equal(report.extensionData.compat.level, "partial");
  assert.deepEqual(report.result.flags, []);
  assert.equal(report.result.code, report.extensionData.score.lowest);
  assert.equal(report.reportContent.viewModel.rushed, false);
  assert.deepEqual(report.extensionData.quality, { rushed: false });
  assert.equal(report.reportContent.textFallback.includes(SCREEN), true);
  assert.deepEqual(Object.keys(report.extensionData).sort(), ["answers", "compat", "consent", "quality", "score"]);
  assert.deepEqual(Object.keys(report.extensionData.score), ["sums", "scores", "total", "levels", "lowest", "highest", "relations", "weak"]);
  for (const key of ["practice", "journal", "note", "openText", "phone", "wechat", "qr"]) {
    assert.equal(keysOf(report).includes(key), false, key);
  }
  assert.equal(JSON.stringify(report).includes("今天写了很长一段话"), false);
});
