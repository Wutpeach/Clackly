# Issue #14 · 首页视觉候选

日期：2026-11-09。分支：feat/issue-14-homepage。对应 [Issue #14](https://github.com/Wutpeach/Clackly/issues/14)。等待用户视觉验收；本记录不代表同意合并或发布。

## 预览与截图

本机生产构建预览：[中文](http://127.0.0.1:4321/Clackly/) · [English](http://127.0.0.1:4321/Clackly/en/)。地址仅在运行预览的电脑可用。

在 site/ 中运行 npm ci、npm run build，然后运行 npm run preview 可重新预览。默认基础路径仍为 /Clackly/。GitHub Actions 的 clackly-site-preview artifact 提供生产构建与测试证据，不会部署 Pages。

| 首页 | 1440px 首屏 | 1440px 整页 | 390px 手机 | 320px 手机 |
| --- | --- | --- | --- | --- |
| 中文 | [查看](zh-1440-hero.png) | [查看](zh-1440.png) | [查看](zh-390.png) | [查看](zh-320.png) |
| English | [View](en-1440-hero.png) | [View](en-1440.png) | [View](en-390.png) | [View](en-320.png) |

截图来自 Windows 下 headless Edge 对实际生产构建的渲染；桌面视口 1440×960、手机视口 390×844／320×844。截图在字体与图片加载后拍摄，动态效果已完成或禁用。

动效直接在上述预览地址刷新与下滑查看；按用户偏好不再提供录屏。旧版录制及其脚本已移除，避免与最终路径描绘效果混淆。

## 设计取舍

- 借鉴 Raycast 的首屏层次、光影空间、大幅产品展示及功能叙事节奏。使用 Clackly R1 图标、HarmonyOS Sans 与自己的剪辑场景；没有使用 Raycast 的素材、文案或代码。
- 根据用户对首版质感的反馈，重做原创弧形方向光、明暗衰减、细边高光与柔和投影，替换平面暖色展示台。用户随后明确选择“首页适配现有主界面”：页面底色以 Palette 的 #151619 为 authority，浅色控件用 #e7e8ea，弧光改为银白色；本轮不涉及应用或图标改版。这是方向选择，最终视觉验收仍待进行。
- 大标题、清晰下载与暗色产品展示台共同建立首屏；Launcher／搜索切换使用标准按钮，支持键盘。背景时间线为有标签的网页示意。
- 搜索与 Extension View 改用开放的上下错位陈列，扩大真实界面，移除成对卡片。暗色 AI workbench 表达需求到扩展的路径，完整提示词可展开并复制。
- 手机端重排首屏、面板与功能段落；320px 中文标题保持语义断行。桌面与手机都保留官方 Release、文档、Build with AI、语言和 GitHub 入口。
- 用户认可当前配色后要求增加动效，并用箭头明确路径和更慢的节奏：银白光弧从右下起笔，沿右侧向上、再向左逐段描出，4 秒完成；正文和下载保持稳定。下滑到功能段落时，以 1.05–1.3 秒的轻位移／微虚化分组展出，每组只播放一次。键盘聚焦立即显示，减少动态效果显示完整静态光弧；无 JS 时内容完整可读，不新增动效依赖。用户在刷新查看后反馈“效果不错”，保留当前视觉与节奏。
- 首页样式记录见 site/DESIGN.md；[本轮方向](direction.md)是开发记录，尚未成为用户确认的视觉规范。

## 实际验证

- npm run build 通过：41 个 HTML 页面、19 对双语文档路由、2,988 个站内链接／资源／锚点、19 份与官方 Skill 字节一致的源文件。检查首页分享图也存在。
- 整站 Playwright 24／24 通过，包含新增 12 项首页测试。覆盖中英文真实下载跳转、文档与 AI 路径、语言切换、展示图切换、提示词剪贴板读回、1440／390／320px 无横向溢出及图片正常加载、光带开场、滚动内容仅展出一次、键盘聚焦立即显示、关闭 JavaScript 的基础可用性、减少动态效果。
- 原有文档回归覆盖 Pagefind、主题切换与持久性、键盘移动导航、长翻译导航、手机表格、官方协议原文与复制失败恢复。
- 真实打开 Cindy 浏览器预览中英文主页；八张指定静态截图均已逐张查看。独立 reviewer 复核光影重做及最终 Palette 配色、截图与 DESIGN.md 一致性，给出 disposition: ship；最终路径描绘、时长、减少动态效果与文档增量也复核通过。Lead 查看了实际浏览器的四个开场阶段和手机端效果，用户随后在本机预览给出正向反馈。此工程审查不替代用户整体产品验收。
- git diff --check 通过。首页没有新增运行时依赖或 Web App 框架。五张新增 PNG（含约 393 KB 的分享图）合计约 588 KB；分享图不在首页正文加载，正文产品 PNG 合计约 129／133 KB（中文／英文），后续展示图延迟加载。
- 本地 Node 为 22.17.1，低于项目声明的 22.19.0 基线；上述构建与测试在本地实际通过，GitHub Docs CI 使用 22.19.0。Astro 保留已有的 i18n/default404 与 public font 警告；资源和浏览器检查通过。

## 产品画面来源

site/public/images/home/launcher.png 和 search.png 来自现有 palette-evidence 工具的 pinned-recent／search-results 场景，以 2x 截取实际应用 renderer。Extension View 画面来自同一构建的真实 ExtensionViewApp，使用中英文只读时间线列表 fixture。它是展示扩展 UI 能力的示例，不声称是预装扩展。

所有项目、时间线、命令投影与选择状态为确定性演示数据。页面与图片替代文本明确标注其边界；没有伪造 Resolve 原生运行截图，也未操作生产项目。renderer 源码及 palette-evidence 工具与 v0.1.6 的 Git diff 为空。

复现素材：先构建 resolve-command-center，再运行 node site/scripts/capture-home-assets.mjs。分享图通过运行预览后在 site/ 执行 node scripts/capture-home-social.mjs 生成。每张 PNG 都有来源 JSON，并内嵌来源元数据；重新生成时应一并保留来源。HomeLight.astro 为本次原创的内联光影矢量，使用渐变、模糊和路径描绘建立光线衰减，不是产品界面。R1 SVG／ICO 原样复用，字体许可证沿用现有完整文件。

## 交付边界

全部改动在独立工作树 D:/Clackly-worktrees/issue-14-homepage 的 site/ 内。主工作区 D:/Clackly 及其本地 Windows R1 图标提交未被改写。没有修改 Starlight 文档内容、应用功能、扩展协议、Docs Sync 或 CI／Pages 发布门禁。

当前候选通过工程验证后交用户查看。合并、正式 Pages 发布与关闭 Issue 均等待后续明确授权。
