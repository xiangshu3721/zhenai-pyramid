/*!
 * result-kit.js · 共用「结果小工具」
 * 作用：把一次测试的结果存到本机（localStorage）、看历史、导出结果长图、重新测试、删除前二次确认。
 * 纯前端，无依赖，不上传任何数据。用法见文件末尾的说明。
 *
 * 每个测试只要做三件事：
 *   1. ResultKit.configure({ id: "scl90", title: "SCL-90 症状自评量表", onRestart: function () { … } })
 *   2. 交卷那一刻：ResultKit.save(summary)         // summary 见下
 *   3. 结果页里放：ResultKit.bar(summary)           // 返回一段 HTML：导出图片 / 历史记录 / 重新测试
 *
 * summary = {
 *   headline: "核心结论，一句话",
 *   sub:      "补充说明（可选）",
 *   who:      "署名 / 基本信息（可选）",
 *   metrics:  [{ label: "焦虑", value: "2.1", frac: 0.42, tone: "ok|mid|high" }],   // frac 0~1 画横条，可省
 *   notes:    ["最多 6 条提示（可选）"]
 * }
 */
(function (root) {
  "use strict";

  var MAX = 30;                       // 每个测试最多保留的记录数
  var PREFIX = "rk.v1.";              // localStorage key 前缀，后面接测试 id
  var cfg = { id: "test", title: "测试", site: "ASVA 常用心理测试", onRestart: null, url: "" };
  var mem = {};                       // 存不进 localStorage 时，本次访问内仍可查看
  var lastSave = null;                // { ok, reason }
  var cur = null;                     // 结果页当前这份 summary
  var overlay = null;

  var INK = "#241c18", PAPER = "#f3ece4", SHEET = "#faf6f1", GREEN = "#2f5d4a", GOLD = "#b8923f",
      OCHRE = "#9b5b3c", SLATE = "#6f7a72", MUTED = "#4e433d", TRACK = "#e4dccf";
  var SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC","SimSun",serif';
  var SANS = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif';

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clip(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmt(t) {
    var d = new Date(t);
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function uid() { return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clean(s) {
    s = s || {};
    var out = {
      headline: clip(s.headline, 120), sub: clip(s.sub, 260), who: clip(s.who, 60),
      metrics: [], notes: []
    };
    (s.metrics || []).slice(0, 16).forEach(function (m) {
      if (!m) return;
      var o = { label: clip(m.label, 24), value: clip(m.value, 24) };
      if (typeof m.frac === "number" && isFinite(m.frac)) o.frac = Math.max(0, Math.min(1, m.frac));
      if (m.tone === "ok" || m.tone === "mid" || m.tone === "high") o.tone = m.tone;
      out.metrics.push(o);
    });
    (s.notes || []).slice(0, 6).forEach(function (n) { if (n) out.notes.push(clip(n, 160)); });
    return out;
  }
  function pageUrl() {
    if (cfg.url) return cfg.url;
    try { return (location.host + location.pathname).replace(/index\.html$/, "").replace(/\/$/, ""); } catch (e) { return ""; }
  }

  /* ---------- 存储 ---------- */
  function key() { return PREFIX + cfg.id; }
  function readStore() {
    var raw;
    try { raw = root.localStorage.getItem(key()); } catch (e) { return { items: mem[cfg.id] || [], status: "unavailable" }; }
    if (!raw) return { items: mem[cfg.id] || [], status: "ok" };
    try {
      var d = JSON.parse(raw);
      var arr = d && Array.isArray(d.items) ? d.items : null;
      if (!arr) throw new Error("bad");
      var items = arr.filter(function (r) { return r && typeof r.id === "string" && typeof r.t === "number" && r.s && typeof r.s.headline === "string"; });
      return { items: items, status: "ok" };
    } catch (e) {
      return { items: [], status: "corrupt" };
    }
  }
  function writeStore(items) {
    mem[cfg.id] = items;
    try {
      root.localStorage.setItem(key(), JSON.stringify({ v: 1, items: items }));
      return { ok: true };
    } catch (e) {
      // 空间满：只留最近 10 条再试一次
      try {
        root.localStorage.setItem(key(), JSON.stringify({ v: 1, items: items.slice(0, 10) }));
        return { ok: true, trimmed: true };
      } catch (e2) {
        var q = e2 && (e2.name === "QuotaExceededError" || e2.code === 22 || e2.code === 1014);
        return { ok: false, reason: q ? "quota" : "unavailable" };
      }
    }
  }
  function list() { return readStore().items.sort(function (a, b) { return b.t - a.t; }); }

  /** 保存一次结果。永远不抛错；失败时返回 { ok:false, reason }，结果页照常可看。 */
  function save(summary, opts) {
    var rec = { id: uid(), t: Date.now(), title: cfg.title, s: clean(summary) };
    var st = readStore();
    var rest = st.items.sort(function (a, b) { return b.t - a.t; });
    // 同一份作答在同一次打开页面里重复交卷（比如返回修改又提交，但答案没变），只更新最新一条，不重复记
    if (opts && opts.key) {
      rec.k = String(opts.key);
      if (rest[0] && rest[0].k === rec.k && Date.now() - rest[0].t < 6 * 3600 * 1000) rest = rest.slice(1);
    }
    var items = [rec].concat(rest).slice(0, MAX);
    var w = writeStore(items);
    lastSave = { ok: w.ok, reason: w.reason || (st.status === "corrupt" ? "recovered" : ""), id: rec.id };
    if (!w.ok) mem[cfg.id] = items;
    return lastSave;
  }
  function removeOne(id) {
    var st = readStore();
    return writeStore(st.items.filter(function (r) { return r.id !== id; }));
  }
  function clearAll() {
    mem[cfg.id] = [];
    try { root.localStorage.removeItem(key()); } catch (e) {}
  }

  /* ---------- 样式 ---------- */
  var cssDone = false;
  function injectCss() {
    if (cssDone) return; cssDone = true;
    var css = [
      ".rk-bar{margin:22px 0 6px;padding:14px 14px 16px;border:1px solid " + GOLD + ";border-radius:4px 16px 4px 16px;background:" + SHEET + ";color:" + INK + ";font-family:" + SANS + ";line-height:1.55}",
      ".rk-bar *{box-sizing:border-box}",
      ".rk-note{margin:0 0 10px;font-size:13px;color:" + MUTED + "}",
      ".rk-note.warn{color:" + OCHRE + "}",
      ".rk-btns{display:flex;flex-wrap:wrap;gap:8px}",
      ".rk-btn{appearance:none;-webkit-appearance:none;border:1px solid " + INK + ";background:transparent;color:" + INK + ";font:inherit;font-size:15px;padding:10px 16px;min-height:44px;border-radius:999px;cursor:pointer;flex:1 1 auto}",
      ".rk-btn.primary{background:" + GREEN + ";border-color:" + GREEN + ";color:#fff}",
      ".rk-btn.danger{border-color:" + OCHRE + ";color:" + OCHRE + "}",
      ".rk-btn:disabled{opacity:.45;cursor:default}",
      ".rk-btn:focus-visible{outline:3px solid " + GOLD + ";outline-offset:2px}",
      ".rk-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(36,28,24,.55);display:flex;align-items:flex-end;justify-content:center;font-family:" + SANS + ";color:" + INK + "}",
      ".rk-ov *{box-sizing:border-box}",
      ".rk-panel{width:100%;max-width:560px;max-height:92vh;max-height:92dvh;background:" + PAPER + ";border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 32px rgba(0,0,0,.25)}",
      "@media (min-width:700px){.rk-ov{align-items:center}.rk-panel{border-radius:18px;max-height:88vh}}",
      ".rk-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid " + TRACK + "}",
      ".rk-head h2{margin:0;flex:1;font:500 18px/1.3 " + SERIF + ";color:" + INK + "}",
      ".rk-x{appearance:none;border:0;background:transparent;font-size:26px;line-height:1;color:" + MUTED + ";min-width:44px;min-height:44px;cursor:pointer}",
      ".rk-body{padding:14px 16px;overflow:auto;-webkit-overflow-scrolling:touch;flex:1}",
      ".rk-foot{display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid " + TRACK + ";background:" + PAPER + "}",
      ".rk-empty{text-align:center;color:" + MUTED + ";padding:32px 8px;font-size:15px}",
      ".rk-item{display:flex;gap:8px;align-items:stretch;margin:0 0 10px}",
      ".rk-open{appearance:none;flex:1;text-align:left;border:1px solid " + TRACK + ";background:" + SHEET + ";border-radius:4px 14px 4px 14px;padding:10px 12px;font:inherit;color:" + INK + ";cursor:pointer;min-height:56px}",
      ".rk-open b{display:block;font-size:13px;font-weight:500;color:" + SLATE + "}",
      ".rk-open span{display:block;margin-top:2px;font-size:15px;line-height:1.45;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
      ".rk-del{appearance:none;border:1px solid " + TRACK + ";background:transparent;color:" + OCHRE + ";border-radius:12px;min-width:56px;font:inherit;font-size:14px;cursor:pointer}",
      ".rk-card{background:" + SHEET + ";border:1px solid " + GOLD + ";border-radius:4px 18px 4px 18px;padding:16px 16px 14px}",
      ".rk-card .k{font-size:12px;color:" + SLATE + ";letter-spacing:.12em}",
      ".rk-card h3{margin:4px 0 2px;font:500 20px/1.35 " + SERIF + "}",
      ".rk-card .d{font-size:13px;color:" + SLATE + "}",
      ".rk-card .h{margin:12px 0 4px;padding-top:12px;border-top:2px solid " + GOLD + ";font:600 18px/1.5 " + SERIF + "}",
      ".rk-card .s{margin:0 0 8px;font-size:14px;color:" + MUTED + ";line-height:1.7}",
      ".rk-m{margin:10px 0}",
      ".rk-m .r{display:flex;justify-content:space-between;gap:10px;font-size:14px}",
      ".rk-m .r b{color:" + GREEN + ";font-weight:600;text-align:right}",
      ".rk-m .t{height:8px;border-radius:4px;background:" + TRACK + ";margin-top:5px;overflow:hidden}",
      ".rk-m .t i{display:block;height:100%;border-radius:4px;background:" + GREEN + "}",
      ".rk-m .t i.mid{background:" + GOLD + "}.rk-m .t i.high{background:" + OCHRE + "}",
      ".rk-card ul{margin:8px 0 0;padding-left:18px;font-size:13.5px;color:" + MUTED + ";line-height:1.7}",
      ".rk-dlg{position:fixed;inset:0;z-index:2147483200;background:rgba(36,28,24,.6);display:flex;align-items:center;justify-content:center;padding:20px;font-family:" + SANS + "}",
      ".rk-dlg .box{width:100%;max-width:340px;background:" + PAPER + ";border-radius:4px 22px 4px 22px;padding:20px 18px 16px;color:" + INK + ";border:1px solid " + GOLD + "}",
      ".rk-dlg h3{margin:0 0 6px;font:500 18px/1.4 " + SERIF + "}",
      ".rk-dlg p{margin:0 0 16px;font-size:14px;line-height:1.65;color:" + MUTED + "}",
      ".rk-dlg .row{display:flex;gap:8px}",
      ".rk-img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:6px;box-shadow:0 2px 14px rgba(36,28,24,.25);-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto}",
      ".rk-tip{margin:0 0 12px;text-align:center;font-size:14px;line-height:1.6;color:" + INK + "}",
      ".rk-tip b{color:" + GREEN + "}",
      ".rk-toast{position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483300;background:" + INK + ";color:#fff;font:14px/1.5 " + SANS + ";padding:10px 16px;border-radius:999px;max-width:86vw;text-align:center}"
    ].join("\n");
    var st = document.createElement("style");
    st.setAttribute("data-rk", "css");
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ---------- 小弹窗 ---------- */
  var toastT;
  function toast(msg) {
    injectCss();
    var t = document.querySelector(".rk-toast");
    if (!t) { t = document.createElement("div"); t.className = "rk-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.style.display = "block";
    clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = "none"; }, 2600);
  }
  /** 二次确认。opts: { title, text, ok, danger } */
  function confirmBox(opts, cb) {
    injectCss();
    var d = document.createElement("div");
    d.className = "rk-dlg"; d.setAttribute("role", "alertdialog"); d.setAttribute("aria-modal", "true");
    d.innerHTML = '<div class="box"><h3>' + esc(opts.title) + "</h3><p>" + esc(opts.text) + '</p><div class="row">' +
      '<button type="button" class="rk-btn" data-no>取消</button>' +
      '<button type="button" class="rk-btn ' + (opts.danger === false ? "primary" : "danger") + '" data-yes>' + esc(opts.ok || "确定") + "</button></div></div>";
    document.body.appendChild(d);
    function close() { if (d.parentNode) d.parentNode.removeChild(d); }
    d.querySelector("[data-no]").onclick = close;
    d.querySelector("[data-yes]").onclick = function () { close(); cb && cb(); };
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    d.querySelector("[data-no]").focus();
  }

  /* ---------- 展示一份 summary（详情页 / 历史里） ---------- */
  function cardHtml(rec) {
    var s = rec.s;
    var h = '<div class="rk-card"><div class="k">' + esc(rec.site || cfg.site) + "</div><h3>" + esc(rec.title || cfg.title) + '</h3><div class="d">' +
      esc(fmt(rec.t)) + (s.who ? " · " + esc(s.who) : "") + '</div><div class="h">' + esc(s.headline) + "</div>";
    if (s.sub) h += '<p class="s">' + esc(s.sub) + "</p>";
    (s.metrics || []).forEach(function (m) {
      h += '<div class="rk-m"><div class="r"><span>' + esc(m.label) + "</span><b>" + esc(m.value) + "</b></div>";
      if (typeof m.frac === "number") h += '<div class="t"><i class="' + (m.tone || "") + '" style="width:' + Math.round(m.frac * 100) + '%"></i></div>';
      h += "</div>";
    });
    if (s.notes && s.notes.length) h += "<ul>" + s.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
    return h + "</div>";
  }

  /* ---------- 历史面板 ---------- */
  function closeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.documentElement.style.overflow = overlayPrevOverflow || "";
  }
  var overlayPrevOverflow = "";
  function openOverlay(title, bodyHtml, footHtml) {
    injectCss();
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "rk-ov"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true");
      overlayPrevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      overlay.addEventListener("click", function (e) { if (e.target === overlay) closeOverlay(); });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<div class="rk-panel"><div class="rk-head"><h2>' + esc(title) + '</h2><button type="button" class="rk-x" data-rk-close aria-label="关闭">×</button></div>' +
      '<div class="rk-body">' + bodyHtml + "</div>" + (footHtml ? '<div class="rk-foot">' + footHtml + "</div>" : "") + "</div>";
    var first = overlay.querySelector(".rk-open,.rk-btn");
    if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
    return overlay;
  }

  function showHistory() {
    var st = readStore(), items = st.items.sort(function (a, b) { return b.t - a.t; });
    var warn = "";
    if (st.status === "unavailable") warn = '<p class="rk-note warn">这台设备不让浏览器保存记录（可能是无痕模式），下面只有本次打开页面后做的结果。</p>';
    if (st.status === "corrupt") warn = '<p class="rk-note warn">之前保存的记录读不出来了，再做一次测试就会重新开始记录。</p>';
    var body = warn;
    if (!items.length) body += '<div class="rk-empty">还没有记录。<br>做完一次测试，结果会自动留在这里。</div>';
    else body += '<p class="rk-note">最多保留最近 ' + MAX + " 条，只存在这台设备上，不会上传。</p>" + items.map(function (r) {
      return '<div class="rk-item"><button type="button" class="rk-open" data-rk-open="' + esc(r.id) + '"><b>' + esc(fmt(r.t)) + "</b><span>" + esc(r.s.headline) + '</span></button><button type="button" class="rk-del" data-rk-del="' + esc(r.id) + '" aria-label="删除这条记录">删除</button></div>';
    }).join("");
    var foot = '<button type="button" class="rk-btn danger" data-rk-clear ' + (items.length ? "" : "disabled") + '>清空全部</button><button type="button" class="rk-btn primary" data-rk-close>关闭</button>';
    openOverlay("历史记录 · " + cfg.title, body, foot);
  }
  function showDetail(id) {
    var rec = list().filter(function (r) { return r.id === id; })[0];
    if (!rec) { showHistory(); return; }
    openOverlay("记录详情", cardHtml(rec),
      '<button type="button" class="rk-btn" data-rk-back>返回列表</button>' +
      '<button type="button" class="rk-btn primary" data-rk-img="' + esc(rec.id) + '">导出图片</button>' +
      '<button type="button" class="rk-btn danger" data-rk-del="' + esc(rec.id) + '" data-from="detail">删除</button>');
  }
  function askDelete(id, fromDetail) {
    var rec = list().filter(function (r) { return r.id === id; })[0];
    if (!rec) { showHistory(); return; }
    confirmBox({ title: "删除这条记录？", text: fmt(rec.t) + " 的这次结果将从这台设备删除，不能恢复。", ok: "删除" }, function () {
      removeOne(id); toast("已删除"); showHistory();
    });
  }
  function askClear() {
    var n = list().length;
    if (!n) return;
    confirmBox({ title: "清空全部历史？", text: "这个测试在这台设备上的 " + n + " 条记录都会删除，不能恢复。", ok: "全部清空" }, function () {
      clearAll(); toast("已清空"); showHistory();
    });
  }

  /* ---------- 导出图片（canvas 自绘） ---------- */
  function wrap(ctx, text, maxW) {
    var lines = [];
    String(text).split("\n").forEach(function (para) {
      var line = "";
      for (var i = 0; i < para.length; i++) {
        var ch = para.charAt(i), test = line + ch;
        if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = ch; } else line = test;
      }
      lines.push(line);
    });
    return lines;
  }
  function drawCard(rec, scale) {
    var W = 750, PADX = 64, CW = W - PADX * 2;
    var s = rec.s;
    var cv = document.createElement("canvas");
    var ctx = cv.getContext("2d");
    function run(g, draw) {
      var y = 0;
      function font(sz, w, fam) { g.font = (w || "400") + " " + sz + "px " + (fam || SANS); }
      function lines(text, sz, color, w, fam, lh, x, maxW) {
        font(sz, w, fam); g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "alphabetic";
        var ls = wrap(g, text, maxW || CW);
        ls.forEach(function (ln) { y += lh; if (draw) g.fillText(ln, x == null ? PADX : x, y - (lh - sz) / 2 - sz * 0.12); });
        return ls.length;
      }
      y = 62;
      // 站点小标
      font(21, "500"); g.fillStyle = SLATE; if (draw) { g.textAlign = "left"; g.fillText((rec.site || cfg.site).split("").join(" "), PADX, y + 40); }
      // 印章
      if (draw) {
        g.fillStyle = GREEN; g.beginPath(); g.moveTo(W - PADX - 64 + 8, y + 8); g.arcTo(W - PADX, y + 8, W - PADX, y + 72, 10);
        g.arcTo(W - PADX, y + 72, W - PADX - 64, y + 72, 10); g.arcTo(W - PADX - 64, y + 72, W - PADX - 64, y + 8, 10); g.arcTo(W - PADX - 64, y + 8, W - PADX, y + 8, 10); g.closePath(); g.fill();
        g.fillStyle = PAPER; g.font = "600 38px " + SERIF; g.textAlign = "center"; g.fillText("测", W - PADX - 32, y + 54);
      }
      y += 96;
      // 标题
      lines(rec.title || cfg.title, 46, INK, "600", SERIF, 62, PADX, CW - 90);
      y += 4;
      lines(fmt(rec.t) + (s.who ? "  ·  " + s.who : ""), 22, SLATE, "400", SANS, 34);
      y += 18;
      if (draw) { g.fillStyle = GOLD; g.fillRect(PADX, y, 96, 4); }
      y += 24;
      // 核心结论
      lines(s.headline, 36, INK, "700", SERIF, 54);
      y += 8;
      if (s.sub) lines(s.sub, 24, MUTED, "400", SANS, 40);
      y += 14;
      // 指标
      (s.metrics || []).forEach(function (m) {
        font(25, "400"); var vw = (function () { font(25, "700"); return g.measureText(m.value).width; })();
        var labelLines = wrap(g, m.label, CW - vw - 24);
        font(25, "400"); g.fillStyle = INK;
        y += 42;
        if (draw) { g.textAlign = "left"; g.font = "400 25px " + SANS; g.fillStyle = INK; g.fillText(labelLines[0], PADX, y); g.textAlign = "right"; g.font = "700 25px " + SANS; g.fillStyle = GREEN; g.fillText(m.value, W - PADX, y); }
        for (var i = 1; i < labelLines.length; i++) { y += 34; if (draw) { g.textAlign = "left"; g.font = "400 25px " + SANS; g.fillStyle = INK; g.fillText(labelLines[i], PADX, y); } }
        if (typeof m.frac === "number") {
          y += 12;
          if (draw) {
            g.fillStyle = TRACK; g.fillRect(PADX, y, CW, 12);
            g.fillStyle = m.tone === "high" ? OCHRE : m.tone === "mid" ? GOLD : GREEN;
            g.fillRect(PADX, y, Math.max(6, CW * m.frac), 12);
          }
          y += 12;
        }
        y += 6;
      });
      // 提示
      if (s.notes && s.notes.length) {
        y += 14;
        if (draw) { g.fillStyle = TRACK; g.fillRect(PADX, y, CW, 2); }
        y += 12;
        s.notes.forEach(function (n) {
          font(23, "400");
          var ls = wrap(g, n, CW - 28);
          ls.forEach(function (ln, i) {
            y += 38;
            if (draw) { g.textAlign = "left"; g.fillStyle = MUTED; g.font = "400 23px " + SANS; g.fillText(ln, PADX + 28, y); if (i === 0) { g.fillStyle = GOLD; g.beginPath(); g.arc(PADX + 8, y - 8, 4, 0, 7); g.fill(); } }
          });
          y += 6;
        });
      }
      // 页脚
      y += 40;
      if (draw) { g.fillStyle = GOLD; g.fillRect(PADX, y, CW, 2); }
      y += 44;
      if (draw) { g.textAlign = "left"; g.font = "500 26px " + SERIF; g.fillStyle = GREEN; g.fillText("认识自己，成为自己，绽放生命！", PADX, y); }
      y += 40;
      if (draw) { g.font = "400 20px " + SANS; g.fillStyle = SLATE; g.fillText("仅供自我了解，不是诊断 · 结果只存在你自己的设备里", PADX, y); }
      y += 32;
      if (draw) { g.font = "400 20px " + SANS; g.fillStyle = SLATE; g.fillText(pageUrl(), PADX, y); }
      y += 54;
      return y;
    }
    // 先量高度，再正式画
    cv.width = W; cv.height = 10;
    var H = run(ctx, false);
    cv.width = W * scale; cv.height = Math.ceil(H * scale);
    ctx = cv.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.strokeRect(30, 30, W - 60, H - 60);
    run(ctx, true);
    return cv;
  }
  var inWechat = /MicroMessenger|QQ\//i.test(navigator.userAgent || "");
  function showImage(dataUrl, filename) {
    var tip = '<p class="rk-tip"><b>长按下面的图片</b>，选「保存到相册」或「保存图片」。</p>';
    var body = tip + '<img class="rk-img" alt="' + esc(cfg.title) + ' 结果长图" src="' + dataUrl + '">';
    var foot = (inWechat ? "" : '<button type="button" class="rk-btn" data-rk-dl>下载图片</button>') + '<button type="button" class="rk-btn primary" data-rk-close>关闭</button>';
    var ov = openOverlay("结果图片", body, foot);
    var dl = ov.querySelector("[data-rk-dl]");
    if (dl) dl.onclick = function () {
      var a = document.createElement("a"); a.href = dataUrl; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
  }
  /** 把一份 summary 画成图并弹出预览。返回 canvas（便于检查）。 */
  function exportImage(summary, t) {
    injectCss();
    var rec = { t: t || Date.now(), title: cfg.title, site: cfg.site, s: clean(summary) };
    var cv;
    try {
      cv = drawCard(rec, 2);
      var url = cv.toDataURL("image/png");
      showImage(url, (cfg.title + "-" + fmt(rec.t).replace(/[^\d]/g, "").slice(0, 12) + ".png").replace(/\s+/g, ""));
    } catch (e) {
      toast("这台设备没能生成图片，可以直接截屏保存。");
    }
    return cv;
  }

  /* ---------- 页面里的按钮条 ---------- */
  function noteHtml() {
    if (lastSave && lastSave.ok) return '<p class="rk-note" data-rk-note="ok">✓ 这次结果已保存在这台设备（不上传），可在「历史记录」里再看。</p>';
    if (lastSave && !lastSave.ok) return '<p class="rk-note warn" data-rk-note="fail">这台设备暂时存不下记录（可能是无痕模式或空间已满）。结果照常能看，建议先点「导出图片」留一份。</p>';
    return '<p class="rk-note" data-rk-note="none">每次做完的结果都会记在「历史记录」里，只存在这台设备上。</p>';
  }
  /** 结果页按钮条（HTML 字符串）。opts.restart === false 不放「重新测试」；opts.export === false 不放「导出图片」（页面已有自己的导出时用）。 */
  function bar(summary, opts) {
    opts = opts || {};
    injectCss();
    cur = clean(summary);
    var n = list().length;
    return '<div class="rk-bar" data-rk-bar>' + noteHtml() + '<div class="rk-btns">' +
      (opts.export === false ? "" : '<button type="button" class="rk-btn primary" data-rk="export">导出图片</button>') +
      '<button type="button" class="rk-btn" data-rk="history">历史记录' + (n ? "（" + n + "）" : "") + "</button>" +
      (opts.restart === false ? "" : '<button type="button" class="rk-btn" data-rk="restart">重新测试</button>') +
      "</div></div>";
  }
  /** 封面上的「历史记录」入口（HTML 字符串）。没有记录时返回空串，除非 opts.always。 */
  function historyButton(opts) {
    opts = opts || {};
    var n = list().length;
    if (!n && !opts.always) return "";
    injectCss();
    return '<button type="button" class="' + (opts.className || "rk-btn") + '" data-rk="history">' + (opts.label || "历史记录") + (n ? "（" + n + "）" : "") + "</button>";
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b;
    if ((b = t.closest("[data-rk]"))) {
      var a = b.getAttribute("data-rk");
      if (a === "export") { if (cur) exportImage(cur); }
      else if (a === "history") showHistory();
      else if (a === "restart") { if (typeof cfg.onRestart === "function") cfg.onRestart(); }
      return;
    }
    if (!overlay) return;
    if (t.closest("[data-rk-close]")) { closeOverlay(); return; }
    if ((b = t.closest("[data-rk-open]"))) { showDetail(b.getAttribute("data-rk-open")); return; }
    if ((b = t.closest("[data-rk-del]"))) { askDelete(b.getAttribute("data-rk-del"), b.getAttribute("data-from") === "detail"); return; }
    if (t.closest("[data-rk-clear]")) { askClear(); return; }
    if (t.closest("[data-rk-back]")) { showHistory(); return; }
    if ((b = t.closest("[data-rk-img]"))) {
      var rec = list().filter(function (r) { return r.id === b.getAttribute("data-rk-img"); })[0];
      if (rec) { var cv = drawCard(rec, 2); showImage(cv.toDataURL("image/png"), (cfg.title + ".png").replace(/\s+/g, "")); }
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var d = document.querySelector(".rk-dlg");
      if (d) d.parentNode.removeChild(d); else if (overlay) closeOverlay();
    }
  });

  /* ---------- 对外接口 ---------- */
  root.ResultKit = {
    MAX: MAX,
    configure: function (o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) cfg[k] = o[k]; cur = null; lastSave = null; },
    save: save,
    list: list,
    bar: bar,
    historyButton: historyButton,
    showHistory: showHistory,
    exportImage: exportImage,
    showImage: showImage,
    confirm: confirmBox,
    toast: toast,
    clear: clearAll,
    remove: removeOne,
    lastSave: function () { return lastSave; },
    _drawCard: drawCard
  };
})(window);
