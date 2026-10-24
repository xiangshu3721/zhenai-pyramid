/* 珍爱金字塔 · 云端提交号、短链和本机队列。规则与 holland / juying cloud-client 相同。 */
export const PENDING_KEY = "rk.cloud.pending.v1";
export const OWNER_KEY = "rk.cloud.owner.v1";
export const LINKS_KEY = "rk.cloud.links.v1";

const REPORT_RE = /^rpt_[A-Za-z0-9_-]{11,64}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function randomToken(bytes = 32, cryptoObj = globalThis.crypto) {
  const list = new Uint8Array(bytes);
  cryptoObj.getRandomValues(list);
  let chars = "";
  for (let i = 0; i < list.length; i++) chars += String.fromCharCode(list[i]);
  return btoa(chars).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function createSubmissionIds(cryptoObj) {
  const ids = {
    reportId: `rpt_${randomToken(8, cryptoObj)}`,
    clientSubmissionId: `sub_${randomToken(18, cryptoObj)}`,
    linkSecret: randomToken(12, cryptoObj),
    ownerToken: randomToken(18, cryptoObj),
  };
  if (ids.linkSecret === ids.ownerToken) ids.ownerToken = randomToken(18, cryptoObj);
  return ids;
}

/* 同一次结果：称呼 + 题库顺序的 36 个原始分。打卡和不上传的文字不进队列键。 */
export function zhenaiOrderKey(nickname, answers) {
  const name = String(nickname || "");
  const list = Array.isArray(answers) ? answers.join(",") : "";
  return `zhenai:${name}:${list}`;
}

export function parseShareHash(hash) {
  const text = String(hash || "").replace(/^#/, "").trim();
  const dot = text.indexOf(".");
  if (dot < 0) return null;
  let reportId = text.slice(0, dot);
  const linkSecret = text.slice(dot + 1);
  if (!reportId.startsWith("rpt_")) reportId = `rpt_${reportId}`;
  if (!REPORT_RE.test(reportId) || !SECRET_RE.test(linkSecret)) return null;
  return { reportId, linkSecret };
}

export function parseShareLink(input) {
  const text = String(input || "").trim();
  const hashIndex = text.indexOf("#");
  if (hashIndex >= 0) return parseShareHash(text.slice(hashIndex));
  return parseShareHash(text);
}

export function buildShareUrl(base, reportId, linkSecret) {
  const root = String(base || "").replace(/\/?$/, "/");
  const id = String(reportId || "").replace(/^rpt_/, "");
  return `${root}#${id}.${linkSecret}`;
}

export function backoffMs(attempt) {
  if (attempt <= 1) return 5000;
  if (attempt === 2) return 30000;
  return 120000;
}

export function resolveEndpoint(locationLike, config = {}) {
  const configured = typeof config.endpoint === "string" ? config.endpoint.trim() : "";
  if (configured) return configured.replace(/\/$/, "");
  const host = locationLike && locationLike.hostname;
  if (host === "localhost" || host === "127.0.0.1") return String(locationLike.origin || "").replace(/\/$/, "");
  return "";
}

export function resolveReportBase(locationLike, config = {}) {
  if (config.reportPageBase) return String(config.reportPageBase).replace(/\/?$/, "/");
  const host = (locationLike && locationLike.hostname) || "";
  if (host.endsWith("github.io")) return `${locationLike.origin}/mindtest-web/r/`;
  if (locationLike && locationLike.origin) return `${locationLike.origin}/r/`;
  return "https://xiangshu3721.github.io/mindtest-web/r/";
}

export function gateSubmit({ agreed, endpoint, nickname }) {
  if (!agreed) return { ok: false, reason: "consent" };
  if (!nickname) return { ok: false, reason: "nickname" };
  if (!endpoint) return { ok: false, reason: "endpoint" };
  return { ok: true, reason: "" };
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function createCloudStore(storage) {
  return {
    pending() {
      const data = readJson(storage, PENDING_KEY, { v: 1, items: [] });
      return Array.isArray(data.items) ? data.items : [];
    },
    savePending(items) {
      storage.setItem(PENDING_KEY, JSON.stringify({ v: 1, items }));
    },
    upsertPending(item) {
      const items = this.pending().filter((entry) => entry && entry.reportId !== item.reportId);
      items.push(item);
      this.savePending(items);
    },
    removePending(reportId) {
      this.savePending(this.pending().filter((entry) => entry && entry.reportId !== reportId));
    },
    owners() {
      const data = readJson(storage, OWNER_KEY, { v: 1, items: {} });
      return data.items && typeof data.items === "object" ? data.items : {};
    },
    saveOwner(reportId, ownerToken) {
      const items = this.owners();
      items[reportId] = ownerToken;
      storage.setItem(OWNER_KEY, JSON.stringify({ v: 1, items }));
    },
    links() {
      const data = readJson(storage, LINKS_KEY, { v: 1, items: {} });
      return data.items && typeof data.items === "object" ? data.items : {};
    },
    saveLink(key, link) {
      const items = this.links();
      items[key] = link;
      storage.setItem(LINKS_KEY, JSON.stringify({ v: 1, items }));
    },
  };
}

export function isoShanghai(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}:${pick("second")}+08:00`;
}

export function submitBody(item) {
  return { result: item.payload, linkSecret: item.linkSecret, ownerToken: item.ownerToken };
}
