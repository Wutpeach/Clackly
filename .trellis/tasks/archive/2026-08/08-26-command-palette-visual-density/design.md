# Technical Design

## Approach

保留 `PaletteApp` 的三模式状态机、真实 catalog、ranking、selection、execution 与 lifecycle flow，只替换 Launcher/Search/All Actions 的 renderer composition 和 palette-scoped CSS。Default Mode 将同一个 `launcherCommands` 数组投影为三个展示分区；Search Mode 继续渲染独立 `searchCommands`；All Actions 保持现有 grouped catalog 和 alphabet navigation。

不引入路由、store、Command schema 字段、主进程 IPC 或新窗口。视觉变化由现有 renderer ownership 承担；宿主侧唯一例外是把共享 `PALETTE_SIZE` 从 `376×468` 改为用户批准的 `240×320`，并同步直接耦合的窗口断言。

## Presentation Data Flow

1. `rankCommands(catalog, "", pinnedIds, recentIds).slice(0, 9)` 继续生成唯一 launcher source list。
2. Renderer 从该列表派生：
   - `pinned`: `pinnedIds.has(command.id)`；
   - `recent`: 不在 pinned 且 `recentIds.has(command.id)`；
   - `commands`: 不在前两类。
3. 三个 section 只负责显示；flatten 后顺序和 identity 与 source list 一致，`activeCommands`、selected index、Enter execution 不获得第二份 source of truth。
4. Search 仍由 `mode === "search"` 唯一控制，query change 仍重置 selection；Default sections 不在 DOM 中。
5. All Actions 仍由 grouped catalog 派生，不改变 alphabet/group semantics。

若实现需要复用或测试 section projection，可在 `model.mjs` 增加一个纯函数，并用 `model.test.mjs` 覆盖顺序、去重和空集合；不得加入 UI-only command fixtures。

## Component Boundaries

- `Icon`: 保留现有 Lucide map、`strokeWidth={1.9}` 与 `absoluteStrokeWidth`。
- `CommandMeta`: 收敛为紧凑单行结构，支持 name、弱 metadata/status、monochrome icon 和可选真实 keycap；不读取新 metadata 字段。
- `CommandRow`（可在 `App.jsx` 内提取的小组件）: 统一 Launcher/Search/All Actions 的 accessible button props、hover/focus/hint/interaction handlers，避免三份 JSX 在视觉重构后漂移。
- `CommandSection`（可选的小组件）: 只组合 section label 和 rows；空分区不渲染。
- `PaletteFooter`: 复用当前 Settings、Pin、All Actions、Search affordances 的现有 callbacks；只改变位置与权重，不新增行为。
- `interaction-help/status`: 保持现有 semantic role 和 data flow，仅改变紧凑 panel presentation。

组件是否抽取以减少真实重复为准；不创建跨产品的通用 component library。

## Hover and Selection

当前 command buttons 在 `onMouseEnter` 中同时设置 `selectedIndex` 和 `hintedCommand`，因此 `:hover` 会立即获得 `.selected`。为了实现不同层级，可在 `PaletteApp` 内保留 `hoveredCommandId` 或只让 mouse enter 更新 `hintedCommand`，同时：

- keyboard selection 继续由 `selectedIndex` 控制；
- pointer click/context-menu 继续直接执行事件所带 command；
- focus 仍可更新 keyboard selection；
- pointer leave 清理 hover/hint；
- selected 与 hover 可通过 class/pseudo-class 独立着色。

这是 renderer-local presentation/interaction state，不进入 model、preload、main、domain 或 runtime。

## Visual System

在 `styles.css` 的现有 root tokens 上增加/调整少量 palette-owned tokens，例如 row height、section height、footer height、icon slot、selected fill/foreground、hover fill 与 compact spacing。核心方向：

- Window/panel 继续使用 neutral near-black 和已验证 rectangular shell。
- Search `28–30px`；row `27–29px`；section label `20–22px`；footer `26–28px`。
- Row default transparent；hover 用低 alpha neutral；selected 用浅 neutral fill + dark foreground。
- Command Name 使用最强文本 token；metadata/section/keycap/footer 逐级降低 contrast。
- Icon slot `14–16px`，无独立 card background；keycaps 小、弱 border、低 contrast。
- Border 仅用于 shell/search/secondary surface 与必要 separator；row 默认无 outline card。
- Motion 保持 `80–120ms` 级别且遵循 `prefers-reduced-motion`。

`DESIGN.md` 与 frontend quality spec 中仍描述 3×3 layered tiles / orange-edge selection 的 palette 条款，需要在最终实现稳定后通过 Trellis spec update 收敛为新的真实 contract；`.impeccable/design.json` 的既有 drift 不作为本任务副作用修复。

## Fixed Host Contract

`electron/main/window.js` 中的唯一 `PALETTE_SIZE` 改为 `240×320`；Launcher / Search / All Actions、standalone Electron 与 Workflow Integration 继续共享它。不得添加 renderer-to-main resize IPC、mode size map、show-time `setSize()` 或 `center()`。现有 cursor-near positioning 使用共享 width/height 计算翻转与 clamp，需要同步更新精确尺寸断言和小 work-area 测试预期，但算法与生命周期不改。

`styles.css` 的 `.browser-preview` 尺寸同步为 `240×320`，用于 CSS geometry 与 truthful empty state。实现阶段仍以真实 `240×320` Electron footprint 做权威交互/裁切验证：确认 name 优先、row 不因 metadata 变双行、controls 不重叠、scroll 只发生在内容区域。由于 browser fallback 按规范为空，不能把空 Vite screenshot 当作有内容的验收证据。

## Shortcut and Submenu Compatibility

- 不渲染 `[Ctrl] [K]` 或 per-command shortcut badges；没有 authoritative behavior/metadata。
- 只保留真实 launcher position keycaps 与 Search `ESC`，并统一弱化样式。
- 不新增 submenu state、nested commands、triangle 或外部 panel window。
- All Actions 仍是同窗口 content mode；interaction-help/status 是唯一可精炼的次级 panel。

## Accessibility and Compatibility

- 保留 `role=listbox/option/group`、`aria-selected`、`aria-disabled`、`aria-describedby`、tooltip/status roles 和 control labels。
- Selected 的浅色 fill 与深色 foreground 必须覆盖 name/icon/metadata/status 的对比；disabled 不仅依赖透明度或色相。
- `focus-visible` 对 interactive controls 继续可见；`.palette-shell` 只抑制自身程序化 focus outline。
- Renderer 仍只通过 preload 发送 command id 或 normalized mouse facts。

## Verification Strategy

- Pure model tests：ranking/search 现有测试；若添加 section projection，则覆盖 order/dedupe/empty。
- Window contract tests：固定 `240×320`、cursor-near flip/clamp、rectangular shell、无 mode resize IPC。
- Build/full tests：Vite production build 与完整 Node/Python suite。
- Packaged window：`package:win`、`package:verify`、`workflow:install:package` 后再进入 Resolve 手测。
- Manual Electron：Default、Search、All Actions、hover vs selected、keyboard navigation、Pin、empty/multiple results、long name/category、disabled/recovery、interaction help。
- Resolve handoff：自动验证通过后先安装 Workflow package，再请用户重启 Resolve 并只在本地项目中验证 Recent/actual command execution 与 hosted rendering。

## Rollback

产品代码 rollback 限于 `electron/renderer/App.jsx`、`styles.css`、必要的 `model.mjs` / `model.test.mjs`，以及 `electron/main/window.js` 的单一尺寸常量与直接测试。若视觉方向失败，可恢复旧 renderer files 和 `376×468` 常量；Command Engine、preload、Workflow lifecycle、capability/runtime 和 persisted data 均未迁移。
