// 报告“数据模型”：页面渲染与导出长图共用同一份文案与结构，保证两边一致。纯函数，浏览器与 node 通用。
import { DIMS, DIM_ORDER, LEVELS } from "./data.js";
import { DIM_TEXT, RELATION_TEXT, GENERIC_RELATION, FOOTER_NOTE } from "./content.js";

/** 带 <em> 的开场白（HTML 用；导出时把 em 当作强调色） */
export function openingText(r) {
  const H = DIMS[r.highest].name, L = DIMS[r.lowest].name;
  if (r.allEqual) return `你的六个层面发展得相当均衡，没有哪一层特别突出，也没有哪一层特别薄。接下来可以从你最想照顾的那一层开始，慢慢来。`;
  const second = r.weak[1];
  if (r.weak.length >= 2 && r.weak[0] === r.lowest) {
    return `你的珍爱金字塔并不缺少向上的力量，你的「<em>${H}</em>」是目前最扎实的一层；但「<em>${L}</em>」与「<em>${DIMS[second].name}</em>」是当前较薄弱的两层。${DIM_TEXT[r.lowest].need}`;
  }
  if (r.weak.length === 1) {
    return `你的珍爱金字塔整体是有力量的，你的「<em>${H}</em>」是目前最扎实的一层；相对薄一点的是「<em>${L}</em>」。${DIM_TEXT[r.lowest].need}`;
  }
  return `你的珍爱金字塔整体是稳的，你的「<em>${H}</em>」是目前最扎实的一层；相对最薄的是「<em>${L}</em>」，但也只是“相对”——它依然是可用的资源。如果想再往前一步，可以从这里开始：${DIM_TEXT[r.lowest].need}`;
}

/** 推荐卡：{ kind: "leak"|"neutral"|"good", title, tag, tagClass, paras[] , boldFirst } */
export function recommendation(r) {
  const low = r.lowest, s = r.scores[low], T = DIM_TEXT[low], H = r.highest;
  if (s < 40) return { kind: "leak", title: "优先修复主题", tag: `${DIMS[low].name} ${s}`, tagClass: "leak", boldFirst: true,
    paras: [T.theme, "这一层目前处在“优先照顾”的位置，建议把它当作近期成长的重点；如果它已经明显影响睡眠、工作或关系，找一位专业的人聊聊会更有帮助。", "先别同时改很多事。只做下面的7天练习，其他的先放一放。"] };
  if (s < 60) return { kind: "plain", title: "推荐：7天自助练习", tag: `${DIMS[low].name} ${s}`, tagClass: "neutral",
    paras: ["这一层是你当前比较明显的耗能点，但还在可以自己慢慢修复的范围。试试下面的7天练习，每天花不到两分钟。"] };
  return { kind: "good", title: "优势资源如何帮助其他维度", tag: `${DIMS[H].name} ${r.scores[H]}`, tagClass: "good",
    paras: [DIM_TEXT[H].helps, `你的六个层面整体都在“可用”以上，最薄的「${DIMS[low].name}」也不是问题，只是还有提升空间。下面的练习可当作轻量的日常巩固。`] };
}

/** 整份报告的结构化模型 */
export function buildReport(r, practice = []) {
  const L = r.lowest, H = r.highest, T = DIM_TEXT[L];
  return {
    title: `最薄的一层是「${DIMS[L].name}」`,
    opening: openingText(r),
    totalLine: { label: "加权总分（参考）", value: r.total, level: r.totalLevel.name, note: "仅作参考，请更多看分项与短板" },
    pyramid: { cap: "每一层填得越满，说明那一层越稳；带红“漏”字的是最薄的一层。", legend: [...LEVELS].reverse().map((l) => ({ id: l.id, name: l.name })) },
    radar: { cap: "虚线是 60 分参考线。红点是漏能量层，深绿点是你的资源。" },
    resource: { title: `资源：${DIMS[H].name}`, tag: `${r.scores[H]} 分 · ${r.levels[H].name}`, paras: [DIM_TEXT[H].resource] },
    leak: { title: `漏能量层：${DIMS[L].name}`, tag: `${r.scores[L]} 分 · ${r.levels[L].name}`, paras: [T.leak, T.need] },
    relations: (r.relations.length ? r.relations.map((x) => RELATION_TEXT[x.id]) : [GENERIC_RELATION]).map((x) => ({ title: x.title, body: x.body })),
    recommendation: recommendation(r),
    practice: { title: `7天自我练习 · ${DIMS[L].name}`, intro: "这7天，每天对自己说（或写下）这一句：", sentence: `“${T.sentence}”`, how: T.how, done: practice.slice(), note: "点一下就算打卡，只记在你自己的手机里。" },
    dims: [...DIM_ORDER].sort((a, b) => r.scores[b] - r.scores[a]).map((k) => ({
      key: k, name: DIMS[k].name + (k === L ? " · 漏" : ""), score: r.scores[k], levelId: r.levels[k].id, levelName: r.levels[k].name, sub: DIMS[k].sub, desc: r.levels[k].desc, leak: k === L })),
    footer: ["结果只保存在你这台设备的浏览器里，没有上传到任何地方。", FOOTER_NOTE],
  };
}
