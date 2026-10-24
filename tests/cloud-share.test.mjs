import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { createCloudStore } from "../js/cloud-client.js";
import { mountZhenaiCloud } from "../js/cloud-share.js";

const SHORT = /^https:\/\/xiangshu3721\.github\.io\/mindtest-web\/r\/#[A-Za-z0-9_-]{11}\.[A-Za-z0-9_-]{16}$/;
const MARK = "SECRET_JOURNAL_9f3c";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function installDom() {
  const listeners = new Map();
  const slot = {
    isConnected: true,
    innerHTML: "",
    attrs: {},
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(type, fn) { listeners.set(type, fn); },
    click(name) {
      listeners.get("click")({
        stopPropagation() {},
        target: {
          closest(sel) {
            if (sel !== "[data-cloud]") return null;
            return { getAttribute: () => name };
          },
        },
      });
    },
  };
  defineGlobal("document", {
    body: { appendChild() {}, removeChild() {} },
    createElement() {
      return { value: "", style: {}, setAttribute() {}, select() {}, parentNode: { removeChild() {} } };
    },
    execCommand() { return false; },
  });
  defineGlobal("localStorage", memoryStorage());
  defineGlobal("location", { hostname: "xiangshu3721.github.io", origin: "https://xiangshu3721.github.io" });
  return slot;
}

function answers(seed = 0) {
  return Array.from({ length: 36 }, (_, index) => ((index + seed) % 5) + 1);
}

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("珍爱金字塔结果页分享", { concurrency: false }, () => {
  test("结果页自动提交一次，分享结果只复制短链", async () => {
    const share = await readFile(new URL("../js/cloud-share.js", import.meta.url), "utf8");
    const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
    const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
    assert.equal(share.includes("分享结果"), true);
    assert.equal(share.includes("我同意"), false);
    assert.equal(share.includes("保存并分享这一次"), false);
    assert.equal(share.includes("二维码"), false);
    assert.equal(share.includes("navigator.share"), false);
    assert.equal(app.includes("mountZhenaiCloud"), true);
    assert.equal(app.includes("data-cloud-slot"), true);
    assert.equal(app.includes('id: "zhenai"'), true);
    assert.equal(app.includes("ensureNick"), true);
    assert.equal(app.includes("RK.guard"), true);
    assert.equal(app.includes("nickReset"), true);
    assert.equal(page.includes("我同意"), false);

    const slot = installDom();
    const calls = [];
    let copied = "";
    defineGlobal("navigator", { clipboard: { writeText: async (text) => { copied = text; } } });
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url: String(url), body, headers: options.headers });
      assert.equal(Object.prototype.hasOwnProperty.call(options.headers, "authorization"), false);
      if (String(url).endsWith("/v1/results")) {
        return {
          status: 200,
          json: async () => ({
            reportId: body.result.reportId,
            previewUrl: "https://tcloudbase.com/preview?score=99",
            url: "https://example.com/long?answers=1,2,3",
          }),
        };
      }
      return { status: 404, json: async () => ({}) };
    };
    const input = {
      nickname: "  小林  ",
      answers: answers(0),
      completedAt: Date.parse("2026-10-24T09:30:00+08:00"),
      practice: [1, 2, MARK],
      journal: MARK,
    };
    mountZhenaiCloud(slot, input);
    assert.match(slot.innerHTML, /分享结果/);
    assert.match(slot.innerHTML, /链接生成中/);
    assert.equal(slot.innerHTML.includes("我同意"), false);
    assert.equal(slot.innerHTML.includes("http"), false);
    await flush();
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/assessment-report-dev\/v1\/results$/);
    assert.equal(calls[0].body.result.assessmentId, "zhenai");
    assert.equal(calls[0].body.result.assessmentVersion, "zhenai-h5-v1");
    assert.equal(calls[0].body.result.nickname, "小林");
    assert.equal(calls[0].body.result.extensionData.consent.agreed, true);
    assert.equal(calls[0].body.result.extensionData.consent.version, "consent-assessment-zhenai-1");
    assert.equal(calls[0].body.result.extensionData.answers.length, 36);
    assert.deepEqual(Object.keys(calls[0].body.result.extensionData.score), ["sums", "scores", "total", "levels", "lowest", "highest", "relations", "weak"]);
    const posted = JSON.stringify(calls[0].body);
    assert.equal(posted.includes(MARK), false);
    assert.equal(posted.includes("tcloudbase.com/preview"), false);
    assert.match(calls[0].body.linkSecret, /^[A-Za-z0-9_-]{16}$/);
    assert.match(calls[0].body.result.reportId, /^rpt_[A-Za-z0-9_-]{11}$/);
    mountZhenaiCloud(slot, input);
    await flush();
    assert.equal(calls.length, 1);
    slot.click("share");
    await flush();
    assert.match(copied, SHORT);
    assert.equal(copied.includes("rpt_"), false);
    assert.equal(copied.includes("tcloudbase"), false);
    assert.equal(copied.includes("score="), false);
    assert.equal(copied.length, 75);
    assert.match(slot.innerHTML, /链接已复制/);
    assert.equal(slot.innerHTML.includes(copied), false);
    const saved = createCloudStore(globalThis.localStorage).links();
    assert.equal(Object.values(saved)[0].reportUrl, copied);
  });

  test("提交失败可以重试同一次，手机号和不完整结果不发请求", async () => {
    const slot = installDom();
    let failed = true;
    const ids = [];
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      ids.push(body.result.reportId);
      if (failed) throw new Error("offline");
      return { status: 200, json: async () => ({ reportId: body.result.reportId }) };
    };
    mountZhenaiCloud(slot, { nickname: "小林", answers: answers(2), completedAt: Date.now() });
    await flush();
    assert.match(slot.innerHTML, /重试/);
    assert.match(slot.innerHTML, /这次没生成链接/);
    assert.equal(slot.innerHTML.includes("http"), false);
    failed = false;
    slot.click("retry");
    await flush();
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1]);
    assert.equal(slot.innerHTML.includes("重试"), false);

    const quiet = installDom();
    const calls = [];
    globalThis.fetch = async () => { calls.push("hit"); return { status: 200, json: async () => ({}) }; };
    mountZhenaiCloud(quiet, { nickname: "13800000000", answers: answers(3) });
    await flush();
    assert.equal(calls.length, 0);
    assert.match(quiet.innerHTML, /称呼不能是手机号/);
    mountZhenaiCloud(quiet, { nickname: "小林", answers: null, journal: MARK });
    await flush();
    assert.equal(calls.length, 0);
    assert.match(quiet.innerHTML, /这一次结果不完整，没法分享/);
    assert.equal(quiet.innerHTML.includes(MARK), false);
  });

  test("链接还在生成时点分享会提示稍后再试，422 不展示腾讯地址", async () => {
    const slot = installDom();
    let release;
    globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
    mountZhenaiCloud(slot, { nickname: "小林", answers: answers(4) });
    assert.match(slot.innerHTML, /disabled/);
    assert.match(slot.innerHTML, /aria-busy="true"/);
    slot.click("share");
    assert.match(slot.innerHTML, /链接生成中，稍后再试/);
    release({ status: 200, json: async () => ({ reportId: "rpt_abcdefghijk" }) });
    await flush();
    assert.match(slot.innerHTML, /分享结果/);
    assert.equal(slot.innerHTML.includes("disabled"), false);

    const denied = installDom();
    globalThis.fetch = async () => ({
      status: 422,
      json: async () => ({ message: "https://tcloudbase.com/preview?score=1" }),
    });
    mountZhenaiCloud(denied, { nickname: "小林", answers: answers(5) });
    await flush();
    assert.match(denied.innerHTML, /重试/);
    assert.match(denied.innerHTML, /这次没生成链接/);
    assert.equal(denied.innerHTML.includes("tcloudbase"), false);
    assert.equal(denied.innerHTML.includes("http"), false);
  });
});
