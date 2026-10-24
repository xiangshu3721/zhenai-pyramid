/* 珍爱金字塔 · 结果页自动提交一次。「分享结果」只复制阅读短链。 */
import { ZHENAI_CLOUD_CONFIG } from "./cloud-config.js";
import {
  backoffMs,
  buildShareUrl,
  createCloudStore,
  createSubmissionIds,
  gateSubmit,
  isoShanghai,
  resolveEndpoint,
  resolveReportBase,
  submitBody,
  zhenaiOrderKey,
} from "./cloud-client.js";
import { buildZhenaiResult, phoneNickname, zhenaiAnswers, zhenaiNickname } from "./cloud-payload.js";

let current = null;
let slotEl = null;
let timer = 0;
let copyTimer = 0;

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function config() {
  return { ...ZHENAI_CLOUD_CONFIG, ...(globalThis.ZHENAI_CLOUD_CONFIG || {}) };
}

function endpoint() {
  return resolveEndpoint(globalThis.location || {}, config());
}

function store() {
  return createCloudStore(globalThis.localStorage);
}

function activeSaved(key) {
  const saved = store().links()[key];
  if (!saved || saved.status !== "active" || !saved.reportUrl) return null;
  return saved;
}

function pendingItem(key) {
  const items = store().pending();
  for (let i = 0; i < items.length; i++) if (items[i] && items[i].orderKey === key) return items[i];
  return null;
}

function still(generation, key) {
  return !!(current && current.generation === generation && current.orderKey === key);
}

function view(input) {
  const saved = activeSaved(input.orderKey);
  const pending = pendingItem(input.orderKey);
  const failed = !!(!saved && !input.saving && pending && pending.attempts > 0 && pending.lastError);
  let note = input.note || "";
  if (!note && input.saving && !saved) note = "链接生成中";
  if (!note && failed) note = pending.lastError || "这次没生成链接";
  const warn = !!(note && note !== "链接已复制" && note !== "链接生成中");
  const busy = input.saving && !saved;
  const retry = failed ? '<button type="button" class="linkbtn za-retry" data-cloud="retry">重试</button>' : "";
  return `<div class="za-share-row">` +
    `<button type="button" class="btn block" data-cloud="share"${busy ? ' disabled aria-busy="true"' : ""}>分享结果</button>` +
    retry +
    (note ? `<p class="za-note${warn ? " warn" : ""}">${esc(note)}</p>` : "") +
    `</div>`;
}

function paint() {
  if (!slotEl || !current) return;
  if (slotEl.isConnected === false) return;
  slotEl.innerHTML = view(current);
}

function later(fn, ms) {
  const id = globalThis.setTimeout(fn, ms);
  if (id && typeof id.unref === "function") id.unref();
  return id;
}

export function mountZhenaiCloud(slot, input) {
  if (!slot) return;
  slotEl = slot;
  input = input || {};
  const nick = zhenaiNickname(input.nickname);
  const packed = zhenaiAnswers(input.answers);
  const key = packed ? zhenaiOrderKey(nick, packed) : `zhenai:incomplete:${nick}`;
  const previous = current && current.orderKey === key ? current : null;
  current = {
    nickname: input.nickname,
    answers: input.answers,
    completedAt: input.completedAt,
    orderKey: key,
    saving: !!(previous && previous.saving),
    note: previous ? previous.note : "",
    generation: previous ? previous.generation : null,
  };
  if (!slot.getAttribute("data-bound")) {
    slot.setAttribute("data-bound", "1");
    slot.addEventListener("click", onClick);
  }
  paint();
  if (current.saving || activeSaved(key)) return;
  const pending = pendingItem(key);
  if (pending && pending.attempts > 0 && pending.attempts < 8) {
    resumePending();
    return;
  }
  submit();
}

function onClick(event) {
  const node = event.target && event.target.closest ? event.target : null;
  const button = node ? node.closest("[data-cloud]") : null;
  if (!button || !current) return;
  if (event.stopPropagation) event.stopPropagation();
  const name = button.getAttribute("data-cloud");
  if (name === "retry") {
    retry();
    return;
  }
  if (name !== "share") return;
  if (activeSaved(current.orderKey)) {
    copyLink();
    return;
  }
  if (current.saving) {
    current.note = "链接生成中，稍后再试";
    paint();
    return;
  }
  retry();
}

function resumePending() {
  if (!current || current.saving || activeSaved(current.orderKey)) return;
  const pending = pendingItem(current.orderKey);
  if (!pending || pending.attempts <= 0 || pending.attempts >= 8) return;
  const wait = Math.max(0, (pending.nextAt || 0) - Date.now());
  globalThis.clearTimeout(timer);
  timer = later(() => { submit(); }, wait);
}

function retry() {
  if (!current || current.saving) return;
  globalThis.clearTimeout(timer);
  const cloud = store();
  const pending = pendingItem(current.orderKey);
  if (pending) {
    pending.attempts = 0;
    pending.lastError = "";
    pending.nextAt = 0;
    cloud.upsertPending(pending);
  }
  current.note = "";
  submit();
}

function completedAtOf(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return isoShanghai(new Date());
  return isoShanghai(date);
}

function ensurePending(cloud, nick) {
  const found = pendingItem(current.orderKey);
  const ids = found || createSubmissionIds();
  const payload = buildZhenaiResult({
    nickname: nick,
    answers: current.answers,
    reportId: ids.reportId,
    clientSubmissionId: ids.clientSubmissionId,
    completedAt: completedAtOf(current.completedAt),
  });
  if (!payload) return null;
  if (found) {
    found.payload = payload;
    cloud.upsertPending(found);
    return found;
  }
  const item = {
    reportId: ids.reportId,
    clientSubmissionId: ids.clientSubmissionId,
    linkSecret: ids.linkSecret,
    ownerToken: ids.ownerToken,
    orderKey: current.orderKey,
    payload,
    attempts: 0,
    nextAt: 0,
    lastError: "",
  };
  cloud.upsertPending(item);
  cloud.saveOwner(ids.reportId, ids.ownerToken);
  return item;
}

function rememberLink(cloud, item, key, generation) {
  if (!still(generation, key)) return;
  const reportUrl = buildShareUrl(resolveReportBase(globalThis.location, config()), item.reportId, item.linkSecret);
  cloud.removePending(item.reportId);
  cloud.saveLink(key, { reportId: item.reportId, reportUrl, status: "active", byteSize: 0 });
  current.note = "";
}

function failPending(item, message, generation, key) {
  const cloud = store();
  item.attempts += 1;
  item.lastError = message;
  item.nextAt = Date.now() + backoffMs(item.attempts);
  cloud.upsertPending(item);
  if (!still(generation, key)) return;
  current.note = "";
  if (item.attempts < 8) {
    globalThis.clearTimeout(timer);
    const delay = backoffMs(item.attempts);
    timer = later(() => {
      if (still(generation, key)) submit();
    }, delay);
  }
}

function rememberError(message) {
  if (!current) return;
  current.saving = false;
  current.note = message;
  paint();
}

function submit() {
  if (!current || current.saving) return;
  const key = current.orderKey;
  if (activeSaved(key)) return;
  const cloud = store();
  const target = endpoint();
  const nick = zhenaiNickname(current.nickname);
  if (!nick) { rememberError("先填一个称呼，才能分享"); return; }
  if (phoneNickname(current.nickname) || phoneNickname(nick)) { rememberError("称呼不能是手机号"); return; }
  const gate = gateSubmit({ agreed: true, endpoint: target, nickname: nick });
  if (!gate.ok) { rememberError("现在没法生成链接"); return; }
  const generation = {};
  current.generation = generation;
  current.saving = true;
  current.note = "";
  paint();
  let item = null;
  try {
    item = ensurePending(cloud, nick);
  } catch {
    if (still(generation, key)) rememberError("这次没生成链接");
    return;
  }
  if (!still(generation, key)) return;
  if (!item) { rememberError("这一次结果不完整，没法分享"); return; }
  const finish = () => {
    if (still(generation, key)) {
      current.saving = false;
      paint();
    }
  };
  try {
    globalThis.fetch(target + "/v1/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submitBody(item)),
    }).then((response) => response.json().then((body) => ({ response, body: body || {} }), () => ({ response, body: {} }))).then((res) => {
      if (!still(generation, key)) return;
      const response = res.response;
      const body = res.body;
      if (response.status === 200 && body.reportId) {
        rememberLink(cloud, item, key, generation);
        return;
      }
      if (response.status === 409) {
        return globalThis.fetch(target + "/v1/results/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reportId: item.reportId, linkSecret: item.linkSecret }),
        }).then((saved) => {
          if (!still(generation, key)) return;
          if (saved.status === 200) {
            rememberLink(cloud, item, key, generation);
            return;
          }
          item.lastError = "这次没生成链接";
          item.attempts = 8;
          cloud.upsertPending(item);
        });
      }
      if (response.status === 422) {
        item.lastError = "这次没生成链接";
        item.attempts = 8;
        cloud.upsertPending(item);
        return;
      }
      failPending(item, response.status === 429 ? "刚才点得太快了，稍后再试" : "这次没生成链接", generation, key);
    }).catch(() => {
      if (!still(generation, key)) return;
      if (item) failPending(item, "这次没生成链接", generation, key);
      else rememberError("这次没生成链接");
    }).then(finish);
  } catch {
    if (still(generation, key)) {
      if (item) failPending(item, "这次没生成链接", generation, key);
      else rememberError("这次没生成链接");
    }
    finish();
  }
}

function legacyCopy(text) {
  const doc = globalThis.document;
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  doc.body.appendChild(area);
  area.select();
  const ok = doc.execCommand("copy");
  if (area.parentNode) area.parentNode.removeChild(area);
  else if (area.remove) area.remove();
  if (!ok) throw new Error("copy");
}

function writeClipboard(text) {
  const nav = globalThis.navigator;
  if (nav && nav.clipboard && nav.clipboard.writeText) {
    return Promise.resolve(nav.clipboard.writeText(text)).catch(() => legacyCopy(text));
  }
  return Promise.resolve().then(() => legacyCopy(text));
}

function copyLink() {
  if (!current) return;
  const saved = activeSaved(current.orderKey);
  if (!saved) return;
  writeClipboard(saved.reportUrl).then(() => {
    current.note = "链接已复制";
    paint();
    globalThis.clearTimeout(copyTimer);
    copyTimer = later(() => {
      if (current && current.note === "链接已复制") {
        current.note = "";
        paint();
      }
    }, 2500);
  }, () => {
    current.note = "没复制上，再点一次";
    paint();
  });
}
