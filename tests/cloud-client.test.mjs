import assert from "node:assert/strict";
import test from "node:test";
import { ZHENAI_CLOUD_CONFIG } from "../js/cloud-config.js";
import {
  backoffMs,
  buildShareUrl,
  createSubmissionIds,
  gateSubmit,
  parseShareLink,
  resolveEndpoint,
  resolveReportBase,
  zhenaiOrderKey,
} from "../js/cloud-client.js";

test("短链是 github.io 的 #id.secret，不含 rpt_ 前缀", () => {
  const ids = createSubmissionIds();
  const url = buildShareUrl(ZHENAI_CLOUD_CONFIG.reportPageBase, ids.reportId, ids.linkSecret);
  assert.match(url, /^https:\/\/xiangshu3721\.github\.io\/mindtest-web\/r\/#[A-Za-z0-9_-]{11}\.[A-Za-z0-9_-]{16}$/);
  assert.equal(url.includes("rpt_"), false);
  assert.equal(url.includes("tcloudbase"), false);
  assert.equal(url.length, 75);
  assert.deepEqual(parseShareLink(url), { reportId: ids.reportId, linkSecret: ids.linkSecret });
  assert.equal(ids.linkSecret === ids.ownerToken, false);
});

test("提交门和地址：同意在协议里，页面不另问", () => {
  assert.deepEqual(gateSubmit({ agreed: true, endpoint: "https://example.test", nickname: "林深" }), { ok: true, reason: "" });
  assert.equal(gateSubmit({ agreed: false, endpoint: "https://example.test", nickname: "林深" }).reason, "consent");
  assert.equal(gateSubmit({ agreed: true, endpoint: "", nickname: "林深" }).reason, "endpoint");
  assert.equal(gateSubmit({ agreed: true, endpoint: "https://example.test", nickname: "" }).reason, "nickname");
  assert.equal(resolveEndpoint({ hostname: "localhost", origin: "http://localhost:5173" }, ZHENAI_CLOUD_CONFIG), ZHENAI_CLOUD_CONFIG.endpoint);
  assert.equal(resolveReportBase({ hostname: "localhost", origin: "http://localhost:5173" }, ZHENAI_CLOUD_CONFIG), "https://xiangshu3721.github.io/mindtest-web/r/");
  assert.equal(zhenaiOrderKey("林深", [1, 5]).includes("SECRET"), false);
  assert.equal(backoffMs(1), 5000);
  assert.equal(backoffMs(2), 30000);
  assert.equal(backoffMs(3), 120000);
});
