// 端到端：需要 playwright（不属于项目依赖）。用法：
//   node tests/e2e.mjs <url> <截图输出目录> [playwright模块路径]
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
const [url, outDir, pwPath] = process.argv.slice(2);
const { chromium } = await import(pwPath || "playwright");
fs.mkdirSync(outDir, { recursive: true });
const sizes = [{ name: "m390", width: 390, height: 844, mobile: true }, { name: "d1280", width: 1280, height: 900, mobile: false }];
const fail = [];
const check = (c, msg) => { if (!c) { fail.push(msg); console.log("  FAIL:", msg); } else console.log("  ok:", msg); };
const browser = await chromium.launch();
// 昵称门槛：开始前要先录昵称。这个小函数在弹出昵称框时填上并确认。
const nickGo = async (page, name = "测试者") => {
  await page.waitForSelector(".rk-nick");
  await page.fill(".rk-nick input", "");
  check(await page.locator("[data-rk-nick-go]").isDisabled(), "昵称为空时「开始测评」不可用");
  await page.fill(".rk-nick input", "   ");
  check(await page.locator("[data-rk-nick-go]").isDisabled(), "纯空格也不可用");
  await page.fill(".rk-nick input", name);
  await page.click("[data-rk-nick-go]");
};
for (const sz of sizes) {
  console.log(`== ${sz.name} ==`);
  const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, deviceScaleFactor: sz.mobile ? 2 : 1, isMobile: sz.mobile, hasTouch: sz.mobile, locale: "zh-CN", ...(sz.mobile ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" } : {}) });
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
  await nickGo(page);
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
  check(rep.includes("漏能量层") && rep.includes("加权总分") && rep.includes("7天自我练习") && !rep.includes("想有人陪你聊聊？") && !rep.includes("扫码加翔叔微信"), "报告关键板块且无微信引导");
  check(rep.includes("不是医学或心理诊断"), "页脚声明");
  const svgs = await page.evaluate(() => [...document.querySelectorAll(".chart svg")].map((s) => { const b = s.getBoundingClientRect(); return { w: b.width, h: b.height, polys: s.querySelectorAll("polygon,path").length, texts: s.querySelectorAll("text").length }; }));
  check(svgs.length === 2 && svgs.every((s) => s.w > 250 && s.h > 200 && s.polys > 5 && s.texts >= 6), "3D 金字塔与雷达图渲染 " + JSON.stringify(svgs));
  const pyrTxt = await page.locator("#pyr3d").evaluate((e) => e.textContent);
  check(["珍爱", "允许接纳", "有序性", "平和性", "自聚性", "积极性", "理解与边界", "漏"].every((w) => pyrTxt.includes(w)), "3D 金字塔含各层名称与漏章");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "无横向溢出");
  const fit = await page.locator("#pyr3d svg").evaluate((svg) => {
    const vb = svg.viewBox.baseVal, bad = [];
    svg.querySelectorAll("text").forEach((t) => { const b = t.getBBox(); if (b.x < vb.x || b.x + b.width > vb.x + vb.width || b.y < vb.y || b.y + b.height > vb.y + vb.height) bad.push(t.textContent); });
    const chip = [...svg.querySelectorAll("g")].find((g) => g.textContent.startsWith("理解与边界"));
    const rect = chip && chip.querySelector("rect").getBBox(), tx = chip && chip.querySelector("text").getBBox();
    return { bad, chipOK: !!chip && tx.width < rect.width - 8 };
  });
  check(fit.bad.length === 0 && fit.chipOK, "金字塔文字均在画布内、底座标签不被遮挡 " + JSON.stringify(fit));
  await shot("05-result-top");
  await page.locator("#h-pyr").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator("#pyr-chart").screenshot({ path: path.join(outDir, `${sz.name}-06-result-pyramid.png`) });
  // 自动缓慢旋转：两次取样 transform 不同
  const sig = () => page.locator("#pyr3d .scene").evaluate((e) => e.innerHTML.length + ":" + e.innerHTML.slice(0, 400));
  const s1 = await sig(); await page.waitForTimeout(1500); const s2 = await sig();
  check(s1 !== s2, "3D 金字塔自动缓慢旋转");
  // 拖动旋转（触摸/鼠标）
  const box = await page.locator("#pyr3d").boundingBox();
  const before = await sig();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
  const mid = await sig(); await page.mouse.up();
  check(mid !== before, "拖动可旋转 3D 金字塔");
  await page.locator("#pyr-chart").screenshot({ path: path.join(outDir, `${sz.name}-06b-result-pyramid-dragged.png`) });
  await page.locator("#h-rad").scrollIntoViewIfNeeded();
  await page.locator("#h-rad").locator("xpath=..").screenshot({ path: path.join(outDir, `${sz.name}-07-result-radar.png`) });
  await shot("08-result-full", { fullPage: true });
  // 已去掉微信二维码引导
  check(await page.locator(".talk").count() === 0, "结果页无.talk 二维码区块");
  check(await page.locator("dialog#dlg").count() === 0, "无二维码弹层");
  check(!reqs.some((u) => /wechat-qr|qr\.(png|jpg|jpeg|webp)/i.test(u)), "无二维码图片网络请求");
  await page.click(".day[data-d='1']");
  check(await page.locator(".day[aria-pressed=true]").count() === 1, "7天打卡可点");
  // 导出长图
  await page.locator("#save-img").scrollIntoViewIfNeeded();
  const dlP = sz.mobile ? null : page.waitForEvent("download", { timeout: 20000 });
  await page.click("#save-img");
  await page.waitForSelector("dialog#img-dlg[open]", { timeout: 30000 });
  await page.waitForFunction(() => { const i = document.getElementById("out-img"); return i && i.complete && i.naturalWidth > 1000; });
  const info = await page.evaluate(() => { const i = document.getElementById("out-img"); return { w: i.naturalWidth, h: i.naturalHeight, tip: document.getElementById("img-tip").innerText }; });
  check(info.w >= 1400 && info.w <= 2200 && info.h > 6000, `导出图尺寸 ${info.w}x${info.h}（宽≥1400 即 750@2x）`);
  if (sz.mobile) check(info.tip.includes("长按"), "手机导出预览提示长按保存"); 
  if (dlP) { const d = await dlP; const f = path.join(outDir, `${sz.name}-export-download.png`); await d.saveAs(f); check(/^珍爱金字塔-\d{8}\.png$/.test(d.suggestedFilename()), "桌面端触发下载 " + d.suggestedFilename()); }
  const dataUrl = await page.evaluate(async () => { const i = document.getElementById("out-img"); const b = await (await fetch(i.src)).blob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); });
  fs.writeFileSync(path.join(outDir, `${sz.name}-export-report.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  check(true, "导出长图已保存 " + `${sz.name}-export-report.png`);
  await page.locator("dialog#img-dlg[open]").screenshot({ path: path.join(outDir, `${sz.name}-10-export-dialog.png`) });
  await page.click("#img-x");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "弹层关闭后无横向溢出");
  // 刷新后结果仍在
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#pyr-chart svg");
  check(true, "刷新后结果页恢复");
  // 回首页 → 查看上次结果 → 重新测
  await page.click("#tohome");
  await page.waitForSelector("#viewlast");
  await shot("11-home-after");
  await page.click("#viewlast");
  await page.waitForSelector("#retake");
  await page.click("#retake");
  await nickGo(page);
  await page.waitForSelector("#go");
  check(true, "重新测一次回到提示页");
  // 外部请求检查
  const origin = new URL(url).origin;
  const ext = reqs.filter((u) => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:" + origin));
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
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem("zhenai-pyramid:v1", JSON.stringify({ v: 1, stage: "result", idx: 35, answers: Array(36).fill(2), done: Array(36).fill(2), practice: [], updated: 1 })));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#pyr3d svg");
  const sg = () => page.locator("#pyr3d .scene").evaluate((e) => e.innerHTML);
  const a1 = await sg(); await page.waitForTimeout(1500);
  check(a1 === await sg(), "prefers-reduced-motion：3D 金字塔静止");
  check(errs.length === 0, "reduced-motion 无报错");
  await ctx.close();
}
await browser.close();
console.log(fail.length ? `\n${fail.length} 项失败` : "\n全部通过");
process.exit(fail.length ? 1 : 0);
