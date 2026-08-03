# Integrate Resolve2AE Export Into Clackly

## Goal

将 `D:\Resolve2AE` 已验证的 AE 导出核心作为一个原生 Clackly Feature 集成，使用户能够从 Clackly 命令面板通过键盘或修饰键加左键，将 Resolve 时间线片段发送到 After Effects，同时完整保留现有变换、变速、音频、LUT、OTIO 和 JSX 行为。

## Background

- Resolve2AE 的导出业务逻辑已经独立为 `resolve2ae_core/export.py`，稳定入口是 `process_and_send(resolve, project, ae_path, status_callback, config)`；旧 `Resolve2AE.py` 当前只是独立桌面程序启动器。
- 旧核心只依赖 Python 标准库和 Resolve 脚本模块，并已有 17 个核心测试及 6 组黄金快照覆盖主要导出行为。
- Clackly 已具备 Command Registry、Capability Registry、Python Script Runtime、通用 Config Schema/Settings、Feature Lifecycle 和精确鼠标修饰键 Interaction Binding。
- 当前 Clackly Python 子进程在本机不能直接发现已安装的 `DaVinciResolveScript`；其 ScriptContext 也未携带执行 Command 的 id。
- 代码和约束证据记录在 `research/current-state.md` 与 `research/interaction-mode-adaptation.md`。

## Requirements

### R1: One Native Clackly Feature

- 只注册一个 `ae.export` Capability，使用一个 AE 配置作用域和一个 Python Feature entry。
- 注册四条指向 `ae.export` 的可搜索 Command，分别表达自动、强制当前片段、蓝色标记视频范围、青色标记混合范围。
- 不在 renderer、Command Engine 或 Interaction Binding 中添加 AE 专用执行分支。

### R2: Full Export-Core Parity

- 完整保留现有 `resolve2ae_core` 的片段选择、OTIO 解析、源文件链接、时间码、分辨率、变换、合成模式、恒速/变速曲线、动态缩放、裁剪、镜头矫正、音频、LUT、JSX 生成、自清理与 AE 启动行为。
- 默认 `auto` 模式必须保持旧版选择逻辑和既有黄金快照不变。
- Clackly 运行时不得依赖 `D:\Resolve2AE` 路径；所需核心代码和测试契约归属 Clackly 仓库。

### R3: Explicit Export Modes

- `auto`：普通左键或在主 Command 上按 Enter，保留旧版自动判定。
- `single`：`Ctrl + 左键`，忽略蓝色/青色范围标记，强制导出播放头下最上层启用片段；没有视频时保留旧版音频回退。
- `video-range`：`Shift + 左键`，要求蓝色时长标记，只导出该范围视频。
- `mixed-range`：`Ctrl + Shift + 左键`，要求青色时长标记，导出该范围视频与去重后的音频。
- 四条 Command 均可通过搜索后按 Enter 直接执行其对应模式。
- 显式范围模式缺少所需标记时必须返回明确错误，不得静默退回自动或单点模式。

### R4: Runtime and Configuration

- Python ScriptContext 增加只读 `command_id`，由现有 Command 对象沿 Script Capability/Provider 协议传入；其余上下文字段保持兼容。
- `ae.export` 配置只包含用户需要的字段：必填 AE 可执行文件路径和可选合成名称前缀；调试、许可证、更新及桌面状态不进入用户配置。
- 缺少必填路径继续由通用 Feature Lifecycle 标记为 `missing-config` 并引导 Settings。
- Feature entry 在执行边界验证 AE 路径确实指向文件；无效路径和核心终态失败必须作为 Command 错误返回，使面板保持可见。
- Clackly 的共享 Python Resolve Adapter 负责 Windows 标准 Resolve 模块路径发现；Feature 不以导入 Clackly 内部模块的方式自行连接 Resolve。

### R5: Interaction Compatibility

- 主导出卡片采用固定默认映射：Click → `auto`，Ctrl+Click → `single`，Shift+Click → `video-range`，Ctrl+Shift+Click → `mixed-range`。
- 每条辅助导出 Command 自己的卡片保留普通左键执行能力。
- 新安装获得上述默认绑定；仅包含旧版默认 marker binding 的未定制配置可安全升级。显式空绑定或任何自定义绑定不得被覆盖。
- 现有 binding-derived interaction help 自动展示各触发方式和 action Command 描述，不添加手写提示表。

### R6: Platform and Developer Materials

- 首版发布与真实验收以 Windows 为准，使用 Resolve Studio Workflow Integration 和 Windows After Effects。
- 保留旧核心的 macOS 分支，但首版不承诺 macOS 发布级兼容。
- 插件任务的 PRD、设计、调研和临时笔记保留在 `.trellis/tasks/`；跨 Feature 稳定约定进入 `.trellis/spec/`；只有用户所需元数据进入 Capability/Command manifests。

## Acceptance Criteria

- [ ] Clackly 发现一个 `ae.export` Feature 和四条关联 Command；Settings 只显示一份 AE 配置。
- [ ] 未配置 AE 路径时，四条 Command 均被通用 `missing-config` 状态阻止并可打开 Settings。
- [ ] Python Feature 收到正确 `command_id`，四条 Command 分别选择 `auto`、`single`、`video-range`、`mixed-range`，且不通过 persisted config 传递本次执行模式。
- [ ] 主卡片的 Click、Ctrl+Click、Shift+Click、Ctrl+Shift+Click 精确执行约定 Command；额外或错误修饰键不误匹配。
- [ ] 四条 Command 搜索可见并能通过键盘 Enter 执行；辅助卡片普通左键可执行自身 Command。
- [ ] `auto` 模式通过原有 17 个核心测试和 6 组黄金快照，生成的关键 JSX 与回调序列不漂移。
- [ ] 强制单点会忽略已有范围标记；蓝色和青色显式模式分别选择正确范围与媒体类型；缺标记时返回明确终态错误。
- [ ] 变换、变速、动态缩放、裁剪/镜头矫正、合成模式、音频去重、LUT 和 AE 已运行/未运行路径均由自动化测试保护。
- [ ] Windows 标准安装的 Resolve Python 模块可由 ScriptContext 发现；无 Resolve、工程、时间线、有效 AE 路径或目标片段时均受控失败。
- [ ] 在 Windows Resolve Studio Workflow Integration 中实测四种鼠标触发和四条键盘 Command，并在 AE 中核对代表性视频、音频、变速和 LUT 结果。
- [ ] Clackly 全量测试、Python 编译检查和生产 renderer build 通过，renderer/Command Engine 中没有 AE 或模式专用分支。

## Out of Scope

- Resolve2AE 的 PySide 桌面 UI、许可证、更新、安装/发布、诊断、单实例和独立配置系统。
- macOS 发布级支持与实机验收。
- 实时进度流、取消、超时、进程池、独立 Python 环境或解释器发现 UI。
- 新的全局 Command 快捷键、键盘模拟、双击、通配修饰键或 Interaction Binding 编辑 UI。
- 多个同色标记的批量队列、标记选择器或新的导出业务能力。
- 迁移旧 Resolve2AE 配置、许可证或桌面运行数据。
- 面向不可信第三方脚本的沙箱、权限或插件市场。
- 为开发文档新增运行时注册表、用户 UI 或插件内说明系统。

## Key Decisions

- 复用并最小适配已测试的 Python 核心，不将导出公式重写为 JavaScript。
- 一个 Capability + 四条 Command；模式来自瞬时 `command_id`，不复制配置或 Capability。
- 普通左键/主 Command Enter 保留旧版 `auto`，确保迁移后的默认习惯不变。
- Windows 是首版唯一发布验收平台。
- 当前任务作为一个端到端交付执行；共享运行时改动与 Feature 接入互相依赖，不拆成会产生不可运行中间态的子任务。

## Technical Notes

- Clackly 当前 Python process request 只有 `{ config }`，backend spec 也明确测试“不转发 Command”；实现必须同步更新协议、测试和 `.trellis/spec/backend/quality-guidelines.md`。
- 现有 Interaction Binding 已支持 target Command 与 action Command 不同，并自动以 action Command 描述生成帮助。
- 当前脚本日志在子进程退出后统一回放；首版面板只显示 `Running command…` 和终态结果。
- 默认 binding 升级只识别当前已知的未修改旧默认形状；若未来出现更多已发布形状，再引入版本化迁移。
