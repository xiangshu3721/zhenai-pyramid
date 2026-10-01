// 本机存储：仅 localStorage，不上传任何数据。不可用时降级为内存。
const KEY = "zhenai-pyramid:v1";
let mem = null;
export let storageOK = true;

export function emptyState() {
  return { v: 1, stage: "home", idx: 0, answers: Array(36).fill(null), done: null, practice: [], updated: 0 };
}

function valid(s) {
  return s && s.v === 1 && Array.isArray(s.answers) && s.answers.length === 36 &&
    s.answers.every((a) => a === null || (Number.isInteger(a) && a >= 1 && a <= 5)) &&
    Number.isInteger(s.idx) && s.idx >= 0 && s.idx < 36;
}

/** 返回 { state, notice }；数据损坏时重置并给出提示 */
export function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    storageOK = true;
    if (!raw) return { state: emptyState(), notice: null };
    const s = JSON.parse(raw);
    if (!valid(s)) throw new Error("bad");
    if (!Array.isArray(s.practice)) s.practice = [];
    return { state: s, notice: null };
  } catch (e) {
    if (storageOK) {
      try { window.localStorage.removeItem(KEY); } catch (_) { storageOK = false; }
      return { state: emptyState(), notice: storageOK ? "上次保存的记录有点问题，已为你重新开始。" : "当前浏览器不允许保存记录，刷新后进度会丢失。" };
    }
    return { state: mem || emptyState(), notice: "当前浏览器不允许保存记录，刷新后进度会丢失。" };
  }
}

export function save(state) {
  state.updated = Date.now();
  mem = state;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    storageOK = true;
  } catch (e) {
    storageOK = false;
  }
  return storageOK;
}

export function clearAll() {
  mem = null;
  try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
