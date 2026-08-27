# Refine Command Palette visual density

## Goal

在不改变 Command Engine、注册、搜索语义、执行 IPC、宿主窗口生命周期或全局状态边界的前提下，将 Clackly 的 Launcher / Search / All Actions 呈现重构为更接近随附设计稿的紧凑深色 command palette：Command Name 是主要信息，默认行安静，Hover 清晰，Selected 成为最强视觉锚点。

## User Value

Resolve 编辑人员可以在更低视觉噪音、更高信息密度的浮层中快速扫描、搜索、选择并执行命令，同时保留现有键盘优先路径和真实 Command Metadata。

## Confirmed Repository Facts

- Palette renderer 集中在 `resolve-command-center/electron/renderer/App.jsx` 与 `styles.css`；UI 状态仍是本地 `launcher` / `search` / `all-actions` 三模式（`App.jsx:164-205`）。
- 当前 Launcher 是 `3×3`、`113px` tile grid；Search / All Actions 共用约 `58px` 的卡片式 command rows，带渐变、边框与阴影（`styles.css:229-354`, `styles.css:528-593`）。
- Search 已经是独立内容模式；进入 search 后 Launcher 内容不会同时渲染（`App.jsx:457-507`）。
- Pinned 与 Recent 当前只是 renderer 内存集合，用于排序；重启后为空，不得伪造或持久化（`App.jsx:177-195`, `model.mjs:67-88`）。
- 用户已选择：默认模式显示真实 `PINNED`、`RECENT`，并用紧凑 `COMMANDS` 分区补足未被这两类覆盖的现有 launcher commands，避免首次打开为空。
- Command metadata 没有 shortcut 字段；frontend spec 明确禁止在权威 presentation contract 出现前合成 shortcut badges。现有可诚实显示的 keycaps 只有 Launcher 位置数字和 Search 的 `ESC`。
- 当前没有 submenu / nested menu 组件或 submenu 状态。现有次级信息面是窗口内的 `interaction-help` tooltip（`App.jsx:597-611`）；在固定 BrowserWindow 外绘制独立 submenu 会需要新的宿主窗口/定位架构。
- Palette BrowserWindow 当前固定为 `376×468`，三种模式共享同一 footprint（`electron/main/window.js:4-8`; `.trellis/spec/frontend/quality-guidelines.md`）。用户已批准将这一个固定 footprint 收敛为 `240×320`；不得恢复按模式 resize、renderer 尺寸 IPC，窗口生命周期与透明合成契约保持不变。
- `styles.css` 的 `.palette-shell.browser-preview` 也硬编码当前 footprint；它必须同步为 `240×320`，但 browser preview 仍按规范只证明 geometry/empty state，不注入 commands。
- 真实可见 catalog 当前只有 Add Marker、Export to After Effects、Paste Clipboard Image；内部 AE actions 不进入 palette。Browser preview 按规范返回空 catalog，不能作为有内容的视觉基线。

## Requirements

### R1 — Scope and Architecture

- 主要修改 Command Palette / Actions renderer 的 presentation、必要的 renderer-local derived presentation state、相关测试与设计/规范记录；为落实用户批准的真实小窗口，仅额外修改共享 `PALETTE_SIZE` 常量及其直接窗口测试。
- 保留现有 Command Metadata、filter/ranking 语义、keyboard execution、mouse interaction binding、feature lifecycle gating、settings opening、hide/show、IPC 与 capability/runtime boundaries。
- 不新增状态管理库、全局 UI state、Command-id presentation branches、演示 commands 或 shortcut metadata。

### R2 — Default Mode

- 将 Launcher 的 card/grid 呈现改为紧凑纵向 command rows，并按 `PINNED`、`RECENT`、`COMMANDS` 分区；空分区不占用大块空间。
- `PINNED` 与 `RECENT` 只展示真实内存集合中的命令并去重；`COMMANDS` 展示剩余 launcher commands，三类 flatten 后保持当前 `rankCommands(...).slice(0, 9)` 的顺序和可执行范围。
- 默认视图保留现有位置数字 keycaps、Pin、Settings、All Actions、搜索入口与命令执行能力，但可重新安排到更弱、更紧凑的视觉位置。

### R3 — Search Mode

- Search 继续作为独立显示模式；Search Mode 只显示 Search、`RESULTS`、结果/空状态和公共弱化 footer，不叠加默认分区。
- Search control 的视觉目标高度约 `28–30px`；结果行目标约 `27–29px`，metadata 与 category 保持单行、右对齐或截断，不普遍制造第二行。
- 空 query、多结果、无结果和长 command name/category 都必须保持可读且不撑高所有 rows。

### R4 — Command Row Hierarchy

- 默认 row 接近透明、无独立 card/button 堆叠感；Hover 使用轻微 neutral fill；Selected 使用明显但克制的浅色 fill 和深色前景，不依赖粗 border。
- 层级顺序为 Selected Command → Command Name → Icon → Section Label → existing keycap/status/category → Footer。
- Command Name 必须单行优先并 ellipsis；category/status 更弱；disabled/lifecycle 状态仍可识别且不靠颜色 alone。
- icon slot 约 `14–16px`，继续使用现有 Lucide `1.9px absoluteStrokeWidth` 约定和 monochrome 渲染。

### R5 — Hover, Selection, Focus

- Pointer hover 与 keyboard selected 必须能呈现两个不同强度。若当前 `onMouseEnter` 同步 selectedIndex 阻碍该层级，可增加仅属于 `PaletteApp` 的 hovered presentation state；不得向 domain/runtime 泄漏。
- Arrow navigation、Enter、Escape、focus-visible、mouse click/context-menu binding 与 disabled recovery 不回归。

### R6 — Footer and Secondary Surfaces

- Footer 高度目标约 `26–28px`，Settings、Pin、Actions/search affordance、separator 与 keycaps 都是弱信息层级。
- 不显示虚假的 `[Ctrl] [K]`，因为仓库没有 Ctrl+K 行为或 shortcut metadata；只调整真实 controls/keycaps 的样式。
- All Actions 仍是同窗口的现有 content mode，采用相同紧凑 rows/section hierarchy；A–Z rail 保持功能但降低视觉权重。
- 现有 interaction-help/status surface 改为边界清楚、阴影轻、间距紧凑的次级 panel。不得把它冒充新增 submenu，也不得创建额外 BrowserWindow 或外部 popover host。

### R7 — Density, Tokens, and Platform Contract

- 优先复用/收敛现有 CSS variables；只增加 palette 需要的少量尺寸/色阶 token，不建设新 design system。
- 生产 BrowserWindow 统一改为 `240×320`，Launcher / Search / All Actions 共用该尺寸和矩形 native+renderer surface；不得添加 mode-specific sizing、resize IPC 或重新居中副作用。
- 避免大面积橙色、明显 gradient cards、强 glow、过多 border/shadow、彩色 icons 与大圆角。

## Acceptance Criteria

- [ ] Default Mode 呈现紧凑 `PINNED` / `RECENT` / `COMMANDS` rows；三类无重复，flatten 后仍是当前最多九个 launcher commands 和相同 rank order。
- [ ] Search Mode 完全替换 Default Mode 的主要内容，包含紧凑 Search、`RESULTS`、单行结果和 truthful empty state。
- [ ] 默认 rows 不再呈现独立 card/button 堆叠感；Hover 与 Selected 明显区分，Selected 是列表最强视觉反馈。
- [ ] Command Name 的对比、字号/字重和空间优先级高于 icon、section、category/status、keycap 与 footer。
- [ ] Add Marker、Export to After Effects、Paste Clipboard Image 在真实 catalog 中均可扫描；长名称与 metadata 截断不抬高 row。
- [ ] 现有数字 keycaps 与 `ESC` 视觉弱化但可读；没有合成 Ctrl+K 或 per-command shortcuts。
- [ ] Footer 与 A–Z rail 明显弱化；Settings、Pin、All Actions/search 入口仍可用且有 accessible names。
- [ ] interaction-help/status 次级 surface 更轻、更紧凑、边界清楚；不新增 submenu 行为或窗口。
- [ ] Arrow/Enter/Escape、keyboard focus、pointer hover/click/context menu、Pin、Recent ranking、Search、All Actions、command execution 与 feature recovery 无回归。
- [ ] 空 catalog、空搜索、多结果、无结果、disabled command、长 command name/category 和 reduced-motion 样式均保持正确。
- [ ] Electron 与 Workflow 共用唯一固定 `240×320` footprint；rectangular shell、cursor-near placement、conceal/reveal lifecycle、command-id-only execution 和 renderer boundary tests 继续通过。
- [ ] `npm test`、`npm run build`、focused renderer/window tests、Impeccable detector（若 hook 可用）和 `git diff --check` 通过。
- [ ] 自动检查后安装 Workflow package；由用户在重启后的 Resolve 中用本地项目手动验证 Default/Search/selection/hover/Pin/Recent/All Actions/interaction help 与实际执行。
- [ ] 尺寸迁移完成后 `package:win` 与 `package:verify` 通过，并使用 packaged Workflow 安装路径完成最终 Resolve handoff。

## Out of Scope

- Command Engine、command registration、search algorithm/semantics、execution/runtime/capability architecture。
- 新 command、shortcut contract、Ctrl+K 行为、shortcut persistence、Pinned/Recent persistence。
- 新 submenu/nested-action model、外部 popover BrowserWindow、mode-specific sizing、renderer resize IPC 或宿主生命周期调整。
- Settings 页面重构、新 icon 系统、大型 design system、动画系统重构或视觉测试基础设施建设。

## Repository / Platform Constraints

- 用户已明确选择 `240×320` 作为约 `200×300` 目标与长名称/metadata 可读性之间的 production footprint；这是一次单一常量迁移，不改变模式或窗口生命周期架构。
- 设计稿的相邻外置 submenu 当前没有对应行为或可越过 BrowserWindow clip 的 renderer surface；本任务只精炼现有 All Actions / interaction-help 次级呈现。
- 设计稿的 `[Ctrl] [K] Actions` 和每条 shortcut metadata 当前没有权威数据与行为；本任务只保留真实数字位置 keycaps 和 `ESC`。

## Open Questions

None. Final implementation still requires explicit approval of this planning summary.
