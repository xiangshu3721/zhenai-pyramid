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
- 雷达图为 SVG 自绘；金字塔是 **纯 SVG 伪 3D**（真旋转 + 轻微透视 + 画家算法 + 明暗，无任何 3D 库）：可左右拖动 / 方向键旋转，空闲时缓慢自转，`prefers-reduced-motion` 下静止。
- **保存完整报告图**：用 canvas 手绘整份报告（含雷达图、3D 金字塔静态版、文字解读、7 天练习），2x 清晰 PNG；桌面直接下载，手机/微信里弹层“长按图片保存”。无外部库、无 CDN。
- 全部资源使用相对路径，兼容 GitHub Pages 的 `/zhenai-pyramid/` 子路径。

## 目录
```
index.html          入口
css/style.css       样式
js/data.js          题库、维度、分级
js/scoring.js       纯函数计分与关联规则（浏览器与 node 共用）
js/content.js       报告文案
js/charts.js        SVG 雷达图与分级配色
js/pyramid3d.js     3D 金字塔（交互版与导出静态版共用同一份几何）
js/report.js        报告数据模型（页面与导出长图共用文案）
js/export.js        长图导出（canvas 手绘）
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
推送到 `main` 后，GitHub Actions 先跑 `npm test`，再把 `index.html css js assets` 发布到 GitHub Pages。

页面不收集任何信息；结果与作答只保存在本机。
