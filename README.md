# 珍爱金字塔 · 自我关系状态评估

一个移动优先的自测 H5：36 题、约 5–7 分钟，看见你与自己、生活、情绪和他人的关系里，**哪一层在漏能量**。
不是心理诊断，仅用于自我觉察。

**线上地址：** https://xiangshu3721.github.io/zhenai-pyramid/

## 模型
顶端「珍爱」；核心「允许接纳」；底部四根支柱「有序性 / 平和性 / 自聚性 / 积极性」；外圈「理解与边界」。
6 个维度 × 6 题，5 级量表；反向题（6/12/18/24/30/36）按 6−x 计分；维度得分 = 总分 ÷ 30 × 100（四舍五入）。
分级：80–100 稳定资源层 / 60–79 可用成长层 / 40–59 提醒修复层 / 0–39 优先照顾层。
加权总分（仅供参考）：允许接纳 25%、自聚性 20%、理解与边界 20%、平和性 15%、有序性 10%、积极性 10%。
最低维度并列时取权重更高者。

## 特点
- 纯静态：原生 HTML / CSS / ES Modules，无框架、无构建、无第三方服务、无外部字体（系统字体栈）。
- 隐私：作答与结果只存浏览器 `localStorage`，不上传任何地方。可中断后继续。
- 雷达图与金字塔结构图均为 SVG 自绘。
- 全部资源使用相对路径，兼容 GitHub Pages 的 `/zhenai-pyramid/` 子路径。

## 目录
```
index.html          入口
css/style.css       样式
js/data.js          题库、维度、分级
js/scoring.js       纯函数计分与关联规则（浏览器与 node 共用）
js/content.js       报告文案
js/charts.js        SVG 雷达图 / 金字塔图
js/storage.js       localStorage 读写与容错
js/app.js           页面流程与渲染
tests/              单元测试（node）与端到端脚本（Playwright，非项目依赖）
.github/workflows/  Pages 部署
```

## 本地运行（可选）
```bash
npm test                        # 计分逻辑自测
node scripts/serve.mjs 5173 /zhenai-pyramid/   # 访问 http://localhost:5173/zhenai-pyramid/
```
端到端（需自行安装 playwright）：`node tests/e2e.mjs http://localhost:5173/zhenai-pyramid/ ./shots`

## 部署
推送到 `main` 后，GitHub Actions 先跑 `npm test`，再把 `index.html css js` 发布到 GitHub Pages。

“想有人陪你聊聊？”目前只是占位提示（陪谈 / 导师匹配 / 后续课程，敬请期待），不收集任何信息。
