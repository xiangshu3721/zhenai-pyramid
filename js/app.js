import { DIMS, DIM_ORDER, QUESTIONS, SCALE, CONCEPTS, LEVELS } from "./data.js";
import { computeResult, isComplete, levelOf } from "./scoring.js";
import { DIM_TEXT, RELATION_TEXT, GENERIC_RELATION, FOOTER_NOTE } from "./content.js";
import { radarSVG, pyramidSVG, LEVEL_COLOR } from "./charts.js";
import * as store from "./storage.js";

const app = document.getElementById("app");
let state;
let notice = null;
let advanceTimer = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const answeredCount = () => state.answers.filter((a) => a !== null).length;
const persist = () => store.save(state);

function mount(html, focusSel = "h1, h2, .q-text") {
  app.innerHTML = html;
  window.scrollTo(0, 0);
  const el = app.querySelector(focusSel);
  if (el) { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
const noticeHTML = () => {
  const n = notice; notice = null;
  return n ? `<div class="banner" role="status">${esc(n)}</div>` : "";
};

/* ---------- 首页 ---------- */
function heroPyramid() {
  return `<svg class="hero-pyr" viewBox="0 0 92 80" aria-hidden="true"><path d="M46 4 L88 76 H4 Z" fill="none" stroke="#2A2521" stroke-width="1.4" stroke-linejoin="round"/><path d="M26 41 H66" stroke="#2A2521" stroke-width="1"/><path d="M46 4 V76" stroke="#2A2521" stroke-width=".6" stroke-dasharray="2 3"/><circle cx="46" cy="52" r="6" fill="#A8432F"/></svg>`;
}
function renderHome() {
  state.stage = "home"; persist();
  const n = answeredCount();
  const hasDone = state.done && isComplete(state.done);
  const resume = n > 0 && !hasDone;
  mount(`
  <main class="home">
    <div class="kicker"><span class="seal-mark" aria-hidden="true">爱</span><span>自我关系状态评估</span></div>
    <h1>珍爱金字塔</h1>
    <p class="sub">看见哪一层在漏能量</p>
    ${heroPyramid()}
    <p class="lede">这不是在诊断你有没有心理问题，而是看见：你与自己、生活、情绪和他人的关系，哪一层正在漏能量。</p>
    <p class="meta"><span>共 36 题</span><span>约 5–7 分钟</span><span>结果只存在你的手机里</span></p>
    ${noticeHTML()}
    <div class="home-actions" style="margin-top:18px">
      ${resume ? `<button class="btn" id="resume">继续上次答题（已答 ${n}/36）</button><button class="btn ghost" id="restart">重新开始</button>` : ""}
      ${hasDone ? `<button class="btn" id="viewlast">查看上次的结果</button><button class="btn ghost" id="start">重新测一次</button>` : ""}
      ${!resume && !hasDone ? `<button class="btn" id="start">开始</button>` : ""}
    </div>
    <section class="concepts" aria-labelledby="ch">
      <h2 id="ch">先说清四个词</h2>
      <p class="hint">测评里会反复出现，它们常被误会。</p>
      ${CONCEPTS.map((c) => `<div class="concept"><b>${c.t}</b><span>${c.d}</span></div>`).join("")}
    </section>
    <p class="pyr-note">模型：顶端是“珍爱”；中心是“允许接纳”；下面撑着有序性、平和性、自聚性、积极性四根支柱；外面一圈是“理解与边界”。</p>
    <p class="footnote">${FOOTER_NOTE}</p>
  </main>`, "h1");
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener("click", fn); };
  on("start", () => { resetAnswers(); renderTips(); });
  on("restart", () => { if (confirm("重新开始会清除已答的内容，确定吗？")) { resetAnswers(); renderTips(); } });
  on("resume", () => { renderQuestion(state.idx); });
  on("viewlast", () => renderResult());
}
function resetAnswers() {
  clearTimeout(advanceTimer);
  state.answers = Array(36).fill(null); state.idx = 0; state.done = null; state.practice = [];
  persist();
}

/* ---------- 答题提示 ---------- */
function renderTips() {
  state.stage = "tips"; persist();
  mount(`
  <main class="tips">
    <div class="kicker"><span class="seal-mark" aria-hidden="true">静</span><span>作答之前</span></div>
    <h2>请按“最近一个月”大多数时候的真实状态来答</h2>
    <p class="big">不要按“希望成为的人”作答。<br>没有对错，也没有好坏，第一反应就好。</p>
    <ul class="scale-legend" aria-label="五级选项">
      ${SCALE.map((s) => `<li><span class="n">${s.v}</span>${s.label}</li>`).join("")}
    </ul>
    <button class="btn block" id="go">我准备好了</button>
    <p style="text-align:center;margin-top:10px"><button class="linkbtn" id="back">返回首页</button></p>
  </main>`, "h2");
  document.getElementById("go").addEventListener("click", () => renderQuestion(state.idx || 0));
  document.getElementById("back").addEventListener("click", renderHome);
}

/* ---------- 答题 ---------- */
function renderQuestion(i) {
  clearTimeout(advanceTimer);
  i = Math.max(0, Math.min(35, i));
  state.stage = "quiz"; state.idx = i; persist();
  const cur = state.answers[i];
  const pct = Math.round((answeredCount() / 36) * 100);
  const last = i === 35;
  mount(`
  <main class="quiz">
    <div class="topbar">
      <div class="topbar-row"><span>第 ${i + 1} / 36 题</span><button class="linkbtn" id="home">先到这里</button></div>
      <div class="bar" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="36" aria-valuenow="${answeredCount()}" aria-valuetext="已完成 ${answeredCount()} 题，共 36 题"><i style="width:${pct}%"></i></div>
    </div>
    <section class="q-body" aria-labelledby="qt">
      <div class="q-no">${String(i + 1).padStart(2, "0")}</div>
      <h2 class="q-text" id="qt">${esc(QUESTIONS[i].text)}</h2>
      <div class="opts" role="radiogroup" aria-labelledby="qt">
        ${SCALE.map((s) => `<button type="button" class="opt" role="radio" aria-checked="${cur === s.v}" data-v="${s.v}" tabindex="${(cur ? cur === s.v : s.v === 3) ? 0 : -1}"><span class="n" aria-hidden="true">${s.v}</span><span>${s.label}</span></button>`).join("")}
      </div>
    </section>
    <nav class="q-nav" aria-label="题目切换">
      <button class="btn ghost small" id="prev" ${i === 0 ? "disabled" : ""}>← 上一题</button>
      ${last ? `<button class="btn small" id="finish" ${cur ? "" : "disabled"}>看我的结果</button>` : `<button class="btn ghost small" id="next" ${cur ? "" : "disabled"}>下一题 →</button>`}
    </nav>
    ${!store.storageOK ? `<div class="banner" role="status">当前浏览器不允许保存记录，刷新后进度会丢失。</div>` : ""}
  </main>`, ".q-text");

  const opts = [...app.querySelectorAll(".opt")];
  const choose = (v) => {
    state.answers[i] = v; persist();
    opts.forEach((o) => { o.setAttribute("aria-checked", String(+o.dataset.v === v)); o.tabIndex = +o.dataset.v === v ? 0 : -1; });
    const pb = app.querySelector(".bar"); pb.setAttribute("aria-valuenow", answeredCount());
    pb.setAttribute("aria-valuetext", `已完成 ${answeredCount()} 题，共 36 题`);
    pb.firstElementChild.style.width = Math.round((answeredCount() / 36) * 100) + "%";
    const nb = document.getElementById(last ? "finish" : "next"); if (nb) nb.disabled = false;
    if (!last) { clearTimeout(advanceTimer); advanceTimer = setTimeout(() => renderQuestion(i + 1), 320); }
    else document.getElementById("finish").focus();
  };
  opts.forEach((o, k) => {
    o.addEventListener("click", () => choose(+o.dataset.v));
    o.addEventListener("keydown", (e) => {
      let to = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") to = (k + 1) % 5;
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = (k + 4) % 5;
      if (to !== null) { e.preventDefault(); opts[to].focus(); }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); choose(+o.dataset.v); }
    });
  });
  app.querySelector(".opts").addEventListener("keydown", (e) => { if (/^[1-5]$/.test(e.key)) choose(+e.key); });
  document.getElementById("prev").addEventListener("click", () => renderQuestion(i - 1));
  document.getElementById("home").addEventListener("click", renderHome);
  const nx = document.getElementById("next"); if (nx) nx.addEventListener("click", () => renderQuestion(i + 1));
  const fin = document.getElementById("finish"); if (fin) fin.addEventListener("click", finish);
}
function finish() {
  if (!isComplete(state.answers)) {
    const miss = state.answers.findIndex((a) => a === null);
    notice = null; toast(`第 ${miss + 1} 题还没答，先补上哦`); renderQuestion(miss); return;
  }
  state.done = state.answers.slice(); state.stage = "result"; persist();
  renderResult();
}

/* ---------- 结果 ---------- */
function openingText(r) {
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
function levelLegend() {
  return `<div class="legend">${[...LEVELS].reverse().map((l) => `<span><i style="background:${LEVEL_COLOR[l.id]}"></i>${l.name}</span>`).join("")}</div>`;
}
function recommendation(r) {
  const low = r.lowest, s = r.scores[low], T = DIM_TEXT[low], H = r.highest;
  if (s < 40) return `<div class="card leak"><h3>优先修复主题 <span class="tag leak">${DIMS[low].name} ${s}</span></h3><p><b>${T.theme}</b></p><p>这一层目前处在“优先照顾”的位置，建议把它当作近期成长的重点；如果它已经明显影响睡眠、工作或关系，找一位专业的人聊聊会更有帮助。</p><p>先别同时改很多事。只做下面的7天练习，其他的先放一放。</p></div>`;
  if (s < 60) return `<div class="card"><h3>推荐：7天自助练习 <span class="tag neutral">${DIMS[low].name} ${s}</span></h3><p>这一层是你当前比较明显的耗能点，但还在可以自己慢慢修复的范围。试试下面的7天练习，每天花不到两分钟。</p></div>`;
  return `<div class="card good"><h3>优势资源如何帮助其他维度 <span class="tag good">${DIMS[H].name} ${r.scores[H]}</span></h3><p>${DIM_TEXT[H].helps}</p><p>你的六个层面整体都在“可用”以上，最薄的「${DIMS[low].name}」也不是问题，只是还有提升空间。下面的练习可当作轻量的日常巩固。</p></div>`;
}
function renderResult() {
  if (!state.done || !isComplete(state.done)) { notice = "还没有完整的结果，请先答完题目。"; return renderHome(); }
  let r;
  try { r = computeResult(state.done); } catch (e) { return renderError(e); }
  state.stage = "result"; persist();
  const L = r.lowest, H = r.highest, T = DIM_TEXT[L];
  const rels = r.relations.length ? r.relations.map((x) => RELATION_TEXT[x.id]) : [GENERIC_RELATION];
  mount(`
  <main class="report">
    <div class="kicker"><span class="seal-mark" aria-hidden="true">爱</span><span>你的珍爱金字塔</span></div>
    <h1>最薄的一层是「${DIMS[L].name}」</h1>
    <p class="opening">${openingText(r)}</p>
    <p class="total-chip" title="加权总分仅作参考，不掩盖短板">加权总分（参考）<b>${r.total}</b> · ${r.totalLevel.name}　<span>仅作参考，请更多看分项与短板</span></p>

    <section class="section" aria-labelledby="h-pyr">
      <h2 id="h-pyr">珍爱金字塔</h2>
      <p class="cap">每一层填得越满，说明那一层越稳；带红“漏”字的是最薄的一层。</p>
      <div class="chart" id="pyr-chart">${pyramidSVG(r.scores, r.total, L)}${levelLegend()}</div>
    </section>

    <section class="section" aria-labelledby="h-rad">
      <h2 id="h-rad">六个维度的轮廓</h2>
      <p class="cap">虚线是 60 分参考线。红点是漏能量层，深绿点是你的资源。</p>
      <div class="chart">${radarSVG(r.scores, L, H)}</div>
    </section>

    <section class="section" aria-labelledby="h-hl">
      <h2 id="h-hl">你的资源 · 你的漏能量层</h2>
      <div class="card good"><h3>资源：${DIMS[H].name} <span class="tag good">${r.scores[H]} 分 · ${r.levels[H].name}</span></h3><p>${DIM_TEXT[H].resource}</p></div>
      <div class="card leak"><h3>漏能量层：${DIMS[L].name} <span class="tag leak">${r.scores[L]} 分 · ${r.levels[L].name}</span></h3><p>${T.leak}</p><p>${T.need}</p></div>
    </section>

    <section class="section" aria-labelledby="h-rel">
      <h2 id="h-rel">它们之间的关联</h2>
      ${rels.map((x) => `<div class="rel"><h3>${x.title}</h3><p>${x.body}</p></div>`).join("")}
    </section>

    <section class="section" aria-labelledby="h-prac">
      <h2 id="h-prac">接下来怎么做</h2>
      ${recommendation(r)}
      <div class="card">
        <h3>7天自我练习 · ${DIMS[L].name}</h3>
        <p>这7天，每天对自己说（或写下）这一句：</p>
        <p class="practice-sentence">“${T.sentence}”</p>
        <p>${T.how}</p>
        <div class="days" role="group" aria-label="7天打卡，仅保存在本机">
          ${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button type="button" class="day" data-d="${d}" aria-pressed="${state.practice.includes(d)}"><b>${d}</b>天</button>`).join("")}
        </div>
        <p style="font-size:13px;color:var(--ink-2);margin:6px 0 0">点一下就算打卡，只记在你自己的手机里。</p>
      </div>
    </section>

    <section class="section" aria-labelledby="h-all">
      <h2 id="h-all">六个维度明细</h2>
      <ul class="dimlist">
        ${[...DIM_ORDER].sort((a, b) => r.scores[b] - r.scores[a]).map((k) => `<li><div class="dimrow"><b>${DIMS[k].name}${k === L ? " · 漏" : ""}</b><span>${r.scores[k]} 分 · ${r.levels[k].name}</span></div><div class="dimbar" aria-hidden="true"><i style="width:${r.scores[k]}%;background:${LEVEL_COLOR[r.levels[k].id]}"></i></div><small>${DIMS[k].sub}　${r.levels[k].desc}</small></li>`).join("")}
      </ul>
    </section>

    <section class="talk" aria-labelledby="h-talk">
      <h2 id="h-talk" style="font-size:20px;margin-bottom:6px">想有人陪你聊聊？</h2>
      <p>有些事，一个人想很久也转不出来，说出来会轻一些。</p>
      <button class="btn small" id="talk">了解更多</button>
    </section>

    <div class="end-actions">
      <button class="btn ghost" id="retake">重新测一次</button>
      <button class="btn ghost" id="tohome">回到首页</button>
    </div>
    <p class="footnote">结果只保存在你这台设备的浏览器里，没有上传到任何地方。<br>${FOOTER_NOTE}</p>
    <dialog id="dlg" aria-labelledby="dlg-t">
      <h2 id="dlg-t">敬请期待</h2>
      <p>我们正在准备这些温和的陪伴方式：</p>
      <ul><li>一对一陪谈</li><li>导师匹配</li><li>后续课程</li></ul>
      <p style="font-size:14px;color:var(--ink-2)">现在还没有开放，也不需要你留下任何信息。</p>
      <button class="btn block small" id="dlg-x">好的</button>
    </dialog>
  </main>`, "h1");

  app.querySelectorAll(".day").forEach((b) => b.addEventListener("click", () => {
    const d = +b.dataset.d, k = state.practice.indexOf(d);
    if (k >= 0) state.practice.splice(k, 1); else state.practice.push(d);
    b.setAttribute("aria-pressed", String(state.practice.includes(d))); persist();
  }));
  const dlg = document.getElementById("dlg");
  document.getElementById("talk").addEventListener("click", () => (dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "")));
  document.getElementById("dlg-x").addEventListener("click", () => (dlg.close ? dlg.close() : dlg.removeAttribute("open")));
  document.getElementById("retake").addEventListener("click", () => { if (confirm("重新测一次会清掉当前这份结果，确定吗？")) { resetAnswers(); renderTips(); } });
  document.getElementById("tohome").addEventListener("click", renderHome);
}

/* ---------- 错误 ---------- */
function renderError(err) {
  console.error(err);
  app.innerHTML = `<main class="state-center" role="alert"><h2>页面出了点小状况</h2><p>别担心，你的作答记录还在。</p><div class="state-actions"><button class="btn" id="reload">刷新一下</button><button class="btn ghost" id="reset">清除记录，重新开始</button></div></main>`;
  document.getElementById("reload").addEventListener("click", () => location.reload());
  document.getElementById("reset").addEventListener("click", () => { store.clearAll(); location.reload(); });
}

/* ---------- 启动 ---------- */
function boot() {
  const loaded = store.load();
  state = loaded.state; notice = loaded.notice;
  if (!store.storageOK && !notice) notice = "当前浏览器不允许保存记录，刷新后进度会丢失。";
  const answered = answeredCount();
  if (state.stage === "result" && state.done && isComplete(state.done)) return renderResult();
  if (state.stage === "quiz" && answered > 0) return renderQuestion(state.idx);
  if (state.stage === "tips") return renderTips();
  renderHome();
}
window.addEventListener("error", (e) => { if (e && e.error) renderError(e.error); });
try { boot(); } catch (e) { renderError(e); }
