// 端到端：需要 playwright（不属于项目依赖）。用法：
//   node tests/e2e.mjs <url> <截图输出目录> [playwright模块路径]
import path from "node:path";
import fs from "node:fs";
const [url, outDir, pwPath] = process.argv.slice(2);
const { chromium } = await import(pwPath || "playwright");
fs.mkdirSync(outDir, { recursive: true });
const sizes = [{ name: "m390", width: 390, height: 844, mobile: true }, { name: "d1280", width: 1280, height: 900, mobile: false }];
const fail = [];
const check = (c, msg) => { if (!c) { fail.push(msg); console.log("  FAIL:", msg); } else console.log("  ok:", msg); };
const browser = await chromium.launch();
for (const sz of sizes) {
  console.log(`== ${sz.name} ==`);
  const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: sz.mobile ? 2 : 1, isMobile: sz.mobile, hasTouch: sz.mobile, locale: "zh-CN" });
  const page = await ctx.newPage();
  const errs = [], reqs = [];
  page.on("pageerror", (e) => errs.push("pageerror " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  page.on("requestfailed", (r) => errs.push("reqfailed " + r.url()));
  page.on("response", (r) => { if (r.status() >= 400) errs.push(`http ${r.status()} ${r.url()}`); });
  page.on("request", (r) => reqs.push(r.url()));
  page.on("dialog", (d) => d.accept());
  const shot = (n, o = {}) => page.screenshot({ path: path.join(outDir, `${sz.name}-${n}.png`), ...o });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#start");
  check(await page.locator("h1").innerText() === "珍爱金字塔", "首页标题");
  const home = await page.locator("main").innerText();
  check(["接纳", "积极", "平和", "边界"].every((w) => home.includes(w)) && home.includes("约 5–7 分钟"), "首页含四概念与时长");
  check(!/反向/.test(home), "页面无“反向”字样");
  await shot("01-home");
  await shot("01-home-full", { fullPage: true });
  await page.click("#start");
  await page.waitForSelector("#go");
  check((await page.locator("main").innerText()).includes("最近一个月"), "答题提示页");
  await shot("02-tips");
  await page.click("#go");
  await page.waitForSelector(".opt");
  check((await page.locator(".q-text").innerText()).startsWith("当我表现不如预期时"), "第1题");
  await shot("03-quiz-q1");
  // 答 1-10 题，然后返回、刷新恢复
  const pick = (i) => [4, 5, 3, 4, 2, 2, 4, 3, 5, 1, 4, 2, 5, 3, 4, 4, 2, 3, 5, 4, 3, 2, 4, 5, 3, 4, 2, 4, 5, 1, 4, 3, 2, 2, 3, 4][i];
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction((n) => document.querySelector(".q-no")?.textContent === String(n).padStart(2, "0"), i + 1);
    await page.locator(`.opt[data-v="${pick(i)}"]`).click();
    await page.waitForTimeout(450);
  }
  check((await page.locator(".topbar-row span").first().innerText()).includes("第 11 / 36"), "自动进入第11题");
  await page.click("#prev");
  check((await page.locator(".opt[aria-checked=true]").innerText()).includes("非常符合") === false && await page.locator(".opt[aria-checked=true]").count() === 1, "返回上一题，保留已选项");
  await page.click("#next").catch(() => {});
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".opt");
  check((await page.locator(".topbar-row span").first().innerText()).includes("第 11 / 36"), "刷新后恢复到第11题");
  check(await page.evaluate(() => document.querySelector(".bar").getAttribute("aria-valuenow")) === "10", "刷新后进度 10/36");
  // 键盘作答：聚焦选项后按数字键
  await page.locator(".opt").first().focus();
  await page.keyboard.press("4");
  await page.waitForTimeout(450);
  check((await page.locator(".topbar-row span").first().innerText()).includes("第 12 / 36"), "键盘数字键可作答");
  // 把第11题答案修正为 pick(10)=4（已是4）
  for (let i = 11; i < 36; i++) {
    await page.waitForFunction((n) => document.querySelector(".q-no")?.textContent === String(n).padStart(2, "0"), i + 1);
    if (i === 20) await shot("03-quiz-q21");
    await page.locator(`.opt[data-v="${pick(i)}"]`).click();
    await page.waitForTimeout(i === 35 ? 100 : 450);
  }
  await page.waitForSelector("#finish:not([disabled])");
  await shot("04-quiz-last");
  await page.click("#finish");
  await page.waitForSelector("#pyr-chart svg");
  await page.waitForTimeout(500);
  const rep = await page.locator("main").innerText();
  check(rep.includes("漏能量层") && rep.includes("加权总分") && rep.includes("7天自我练习") && rep.includes("想有人陪你聊聊？"), "报告关键板块");
  check(rep.includes("不是医学或心理诊断"), "页脚声明");
  const svgs = await page.evaluate(() => [...document.querySelectorAll(".chart svg")].map((s) => { const b = s.getBoundingClientRect(); return { w: b.width, h: b.height, polys: s.querySelectorAll("polygon,path").length, texts: s.querySelectorAll("text").length }; }));
  check(svgs.length === 2 && svgs.every((s) => s.w > 250 && s.h > 200 && s.polys > 5 && s.texts >= 6), "雷达图与金字塔图渲染 " + JSON.stringify(svgs));
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "无横向溢出");
  await shot("05-result-top");
  await page.locator("#h-pyr").scrollIntoViewIfNeeded();
  await page.locator("#pyr-chart").screenshot({ path: path.join(outDir, `${sz.name}-06-result-pyramid.png`) });
  await page.locator("#h-rad").scrollIntoViewIfNeeded();
  await page.locator("#h-rad").locator("xpath=..").screenshot({ path: path.join(outDir, `${sz.name}-07-result-radar.png`) });
  await shot("08-result-full", { fullPage: true });
  // 刷新后结果仍在
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#pyr-chart svg");
  check(true, "刷新后结果页恢复");
  await page.click("#talk");
  check(await page.locator("dialog[open]").count() === 1, "陪谈占位弹层可打开");
  await page.locator("dialog[open]").screenshot({ path: path.join(outDir, `${sz.name}-09-dialog.png`) });
  await page.click("#dlg-x");
  await page.click(".day[data-d='1']");
  check(await page.locator(".day[aria-pressed=true]").count() === 1, "7天打卡可点");
  // 回首页 → 查看上次结果 → 重新测
  await page.click("#tohome");
  await page.waitForSelector("#viewlast");
  await shot("10-home-after");
  await page.click("#viewlast");
  await page.waitForSelector("#retake");
  await page.click("#retake");
  await page.waitForSelector("#go");
  check(true, "重新测一次回到提示页");
  // 外部请求检查
  const origin = new URL(url).origin;
  const ext = reqs.filter((u) => !u.startsWith(origin) && !u.startsWith("data:"));
  check(ext.length === 0, "无任何外部请求 " + ext.join(","));
  check(errs.length === 0, "无控制台/网络错误 " + errs.join(" | "));
  await ctx.close();
}
// 极端分：全5 / 全1 的报告不报错；损坏数据恢复
for (const [name, vals] of [["all5", 5], ["all1", 1]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(url);
  await page.evaluate((v) => localStorage.setItem("zhenai-pyramid:v1", JSON.stringify({ v: 1, stage: "result", idx: 35, answers: Array(36).fill(v), done: Array(36).fill(v), practice: [], updated: 1 })), vals);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#pyr-chart svg");
  await page.screenshot({ path: path.join(outDir, `m390-x-${name}-result.png`), fullPage: true });
  check(errs.length === 0, `${name} 结果页无报错`);
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem("zhenai-pyramid:v1", "{broken"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#start");
  check((await page.locator(".banner").innerText()).includes("重新开始"), "损坏数据→提示并重置");
  await page.screenshot({ path: path.join(outDir, `m390-x-corrupt.png`) });
  check(errs.length === 0, "损坏数据无报错");
  await ctx.close();
}
await browser.close();
console.log(fail.length ? `\n${fail.length} 项失败` : "\n全部通过");
process.exit(fail.length ? 1 : 0);
