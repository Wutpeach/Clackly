# Redesign plugin interface prototype

## Goal

按照 Clackly UI Specification v1.0，在现有 DaVinci Resolve Electron 插件中制作一个可验证的 HTML/CSS 前端原型。原型应像 Resolve 内部的精密浮层工具：小、快、深色、结构化、键盘优先，而不是独立消费级启动器窗口。

## User Value

DaVinci Resolve 编辑人员可以高频呼出 Clackly，在尽量不遮挡素材、检视器和时间线的情况下，通过键盘快速发现和执行命令，无需浏览菜单或记忆快捷键。

## Confirmed Repository Facts

- 当前 renderer 使用 React + CSS，由 `electron/renderer/App.jsx` 和 `styles.css` 实现。
- 当前窗口由 `electron/main/window.js` 固定为 `720×360`、无边框、不可缩放、失焦隐藏。
- 当前界面只有搜索列表状态，支持键盘上下选择、Enter 执行和 Escape 隐藏。
- 当前真实命令清单只有 `timeline.addMarker`；现有 IPC 已提供搜索、执行、隐藏与显示事件。
- 仓库尚无 Clackly SVG logo、mark 或统一图标资产。

## Requirements

### R1 — Visual Direction

- 使用专业深色 Resolve 风格，参考 macOS Spotlight、Raycast、Quicker、Alfred，但不得呈现消费级启动器观感。
- 使用小圆角、紧凑间距、高信息密度和清晰层级。
- 核心色值通过 CSS variables 定义：窗口 `#101216`、面板 `#15181E`、Tile `#191D24`、Hover `#202631`、主橙色 `#F36A2D`、Hover 橙色 `#FF7A3D`。
- 主文字、次文字和弱化文字分别使用 `rgba(255,255,255,0.92)`、`.65` 和 `.4`。
- 窗口圆角 `12px`；Tile、输入框和按钮圆角 `8px`，不得使用 `16px+` 的消费级大圆角。
- 窗口阴影为 `0 16px 40px rgba(0,0,0,0.35)`；Tile 依赖边框与对比，不使用可见阴影。

### R2 — Launcher Mode

- 默认窗口目标尺寸为 `376×468`，允许宽 `360–400`、高 `440–500`。
- Header 高 `56px`、水平 padding `16px`，左侧显示 CLACKLY SVG wordmark，右侧显示 Pin 与 Settings 控件。
- 主区为 `3×3` Bento Grid，使用 CSS Grid；Tile 必须保持 `aspect-ratio: 1 / 1`，建议 `96×96px`，间距 `8–10px`，外边距 `16px`。
- Tile 包含简短快捷键信息、居中的 `28–32px` 线性 SVG 图标和最多两行的 `13px/500` 标签。
- Hover 在 `80–120ms` 内提高背景与边框亮度并 `translateY(-1px)`；Selected 使用 `1px` 橙色边框，可带轻微橙色 glow，禁止整块橙色背景或强 glow。
- Pinned 只用小橙点或小 pin 图标表示。
- Bottom Bar 高 `44px`，左侧为进入 All Actions 的 Grid 按钮，中间为 “Type to search…” 提示；不提供独立 History 按钮。

### R3 — Search Mode

- 在 Launcher Mode 中输入任意文本后立即进入 Search Mode。
- 默认保持 `376×468`；只有结果很多且用户持续输入时才允许扩展到 `420×560`。
- 搜索输入高 `42px`、圆角 `8px`，激活时显示橙色边框。
- 结果项高 `54–60px`，支持展示 SVG icon、名称、分类、快捷键和状态。
- 键盘必须支持上下选择、Enter 执行与 Escape 退出/隐藏。
- 结果排序规则依次为：Exact Match、Pinned、Recently Used、Other Commands。

### R4 — All Actions Mode

- 由 Bottom Bar 左侧 Grid 按钮进入；此状态用于浏览全部命令，不是默认状态。
- 与 Launcher 和 Search 保持相同的 `376×468` 窗口尺寸，不因进入浏览模式扩大窗口。
- 主区展示按字母分组的命令，右侧提供宽 `32px` 的 `A–Z/#` 导航。
- 当前选中字母使用橙色文字和橙色指示线；字母选择必须与可见内容同步。
- 分组标题高 `32px`；当前组使用橙色强调，其他组使用 muted gray。

### R5 — Assets and Typography

- 新增 `clackly-logo.svg` 与 `clackly-mark.svg`，保持已确认的几何字标方向：增加字距，字母使用白/灰，`A` 使用橙色强调。
- Logo 建议宽 `110–130px`、高 `20px`；界面图标使用 `lucide-react` 提供的 SVG 线性图标，stroke 固定为 `1.9px` 并启用 absolute stroke width，以保持一致的视觉重量和光学尺寸。
- 字体优先使用 Inter，其次为 SF Pro Display、Geist 和系统无衬线回退；Logo `18px`、Tile `13px`、Search `15px`、Section `14px`。

### R6 — Motion and Accessibility

- 窗口打开动画为 `120–160ms` 的 opacity `0→1` 与 scale `.98→1`；搜索状态转换约 `120ms`。
- 鼠标为可选输入；所有核心路径必须可通过键盘完成，并保留清晰可见的 selected/focus 状态。
- 语义角色、标签和状态提示不得因视觉重构而退化。

### R7 — Prototype Boundary

- 本任务只实现前端原型，不扩展 Resolve command capability、后端执行器或安装流程。
- 原型直接替换现有 Electron renderer，并继续通过现有 preload/IPC 执行真实命令。
- 原型可以使用明确标注为演示数据的命令条目来展示 3×3、搜索结果、Pinned/Recent 排序和 A–Z 分组；不得把演示命令冒充已实现能力。

### R8 — Live Preview

- 实施阶段使用 Impeccable Live 配合现有 Vite HMR 进行实时浏览器预览与元素级迭代。
- Live 目标为 `resolve-command-center/index.html`；由于 PRODUCT.md 与 DESIGN.md 位于仓库根目录，配置归属根目录 `.impeccable/live/config.json`。
- 当前项目没有 CSP，无需修改生产安全策略。
- Live 退出时必须停止 helper server，并清除入口中的临时注入与任何遗留 variant/carbonize 标记。

## Acceptance Criteria

- [ ] 默认 Launcher 以 `376×468` 呈现完整 Header、3×3 正方形 Bento Grid 和 `44px` Bottom Bar。
- [ ] 输入字符会切换到 Search Mode，并能通过键盘选择结果、执行真实可用命令或安全展示演示项状态。
- [ ] Grid 按钮会进入 All Actions Mode，呈现 A–Z/# 导航和同步的字母分组内容。
- [ ] 三种模式的窗口尺寸符合规格，且模式切换不会出现裁切、滚动条泄漏或大面积遮挡。
- [ ] Logo 与 mark 保持自定义 SVG 品牌资产，界面图标由 `lucide-react` 渲染为 SVG；颜色、圆角、阴影和间距使用 CSS variables/tokens。
- [ ] 现有 Escape、失焦隐藏、命令搜索与真实命令执行能力不回退。
- [ ] `npm run build` 和现有 `npm test` 通过。
- [ ] 原型在 Electron/Vite 渲染中完成视觉检查，至少覆盖 Launcher、Search、All Actions 三个状态。
- [ ] Impeccable Live 能在 Vite 页面中连接并预览修改；结束后源码中不遗留 Live 注入或临时 variant 标记。

## Out of Scope

- 新增 Resolve 编辑能力或实现演示命令。
- 持久化 Pinned、Recent History 或用户 Settings。
- 安装器、自动启动与 Workflow Integration 生命周期改造。
- 将原型扩展为通用命令系统，或新增除已确认的 `lucide-react` 之外的第三方 UI/icon 依赖。

## Key Decision

- 用户确认直接替换现有 Electron renderer，而不是创建独立静态页面；真实 IPC、命令执行、Escape 与失焦隐藏行为必须保留。
- 用户进一步确认 All Actions 只切换内容，不改变窗口占用；三种模式统一为 `376×468`。
- 用户确认使用 `lucide-react` 替换 renderer 内手写的图标 path；Clackly logo 与 mark 继续使用自定义 SVG 资产。
