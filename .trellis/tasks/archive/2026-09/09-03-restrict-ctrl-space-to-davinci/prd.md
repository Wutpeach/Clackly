# 仅在 DaVinci Resolve 中响应 Ctrl+Space

## Goal

避免用户在 DaVinci Resolve 与 After Effects 等应用间切换时误触 Clackly 的全局 Ctrl+Space 呼出快捷键。

## Background

- 当前 Ctrl+Space 可在其他应用位于前台时呼出 Clackly 面板。
- 期望只有 DaVinci Resolve 位于前台时才响应此快捷键。
- 首轮实机验收确认功能正确，但逐次启动 PowerShell 的前台探测造成可感知的面板呼出延迟。

## Confirmed Facts

- `resolve-command-center/electron/main/hotkey.js:3-17` 是 standalone 与 Workflow 两个宿主共用的快捷键注册边界。
- `resolve-command-center/electron/main/window.js:597-621` 的共享显示函数还有非快捷键调用者，因此不应在该层加入前台应用限制。
- 项目已在 `resolve-command-center/scripts/internal-beta/ClacklyInstaller.psm1:395-402` 使用 `Resolve.exe` 作为 Windows 下 DaVinci Resolve 的进程标识。
- 当前依赖中没有前台窗口识别库。

## Requirements

- Ctrl+Space 事件到达现有呼出链路后，应检查当前前台应用。
- 面板隐藏时，只有当前台应用进程名是 `Resolve.exe`（大小写不敏感）才允许呼出。
- 面板隐藏且前台应用是 After Effects、其他应用或无法可靠识别时，忽略该快捷键，不显示或聚焦 Clackly 面板。
- 面板已经显示时，Ctrl+Space 仍应关闭面板，不受前台进程门禁影响。
- 不改变其他现有快捷键或面板交互行为。
- 前台识别不得在每次 Ctrl+Space 按键时承担新的 PowerShell 进程启动与 `Add-Type` 编译成本。

## Acceptance Criteria

- [x] DaVinci Resolve 位于前台时，Ctrl+Space 仍可正常呼出 Clackly 面板。
- [x] After Effects 位于前台时，Ctrl+Space 不会呼出或聚焦 Clackly 面板。
- [x] 其他非 DaVinci Resolve 应用位于前台时，Ctrl+Space 不会呼出或聚焦 Clackly 面板。
- [x] 前台应用检测失败时，Ctrl+Space 不会呼出或聚焦 Clackly 面板。
- [x] 面板已经显示时，再次按 Ctrl+Space 仍会关闭面板。
- [x] standalone 与 Workflow 两个宿主行为一致。
- [x] 现有相关自动化检查通过，且新增最小可运行检查覆盖前台应用判断分支。
- [x] 应用启动后预热并复用前台探测能力，按键路径不再逐次创建 PowerShell 进程。
- [x] 实机复测中，Resolve 内 Ctrl+Space 呼出不再出现当前版本的可感知冷启动延迟。

## Out of Scope

- 不新增可配置的应用白名单或设置界面。
- 不修改 Ctrl+Space 的键位。
- 不改变 DaVinci Resolve 之外应用的自身快捷键行为。
- 不限制第二实例唤起或其他非 Ctrl+Space 的主动显示路径。
- 不扩展当前以 Windows 为生产目标的实现范围。

## Technical Notes

- 在快捷键注册边界使用一个宿主生命周期内复用的 Windows 前台进程探测器，避免修改共享窗口显示函数及其其他调用者。
- 前台进程门禁只包围隐藏到显示分支；已显示到隐藏分支保持同步执行。
- 优先使用 Node/Windows 原生能力，不增加新的 npm 依赖。
- 本任务属于轻量改动，PRD 足以承载实施范围，不需要额外的 `design.md` 或 `implement.md`。
