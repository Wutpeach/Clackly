# 修复安装包中的 AE 导出状态探测

## Goal

让通过内部 Beta 安装包部署的 Clackly 能在受支持的真实用户环境中正确判定并执行 `ae.export`，且失败时显示可行动的真实原因，而不是笼统的 `Unable to determine feature status.`。

## Background

- 用户已成功安装测试包，并在 Settings 中配置了 After Effects 可执行文件路径，但 `ae.export` 仍不可用，状态为 `Unable to determine feature status.`。
- 该文案只在 `FeatureStatusManager.refreshOne()` 捕获未分类异常时产生；若只是缺少 `aePath`，现有行为应为 `missing-config`，因此已配置的 AE 路径不是当前错误的直接判定来源（`resolve-command-center/feature-status/FeatureStatusManager.js:104`、`:151`）。
- `ae.export` 的状态探测继续进入 `PythonProvider -> RuntimeManager.resolveAndProbe()`，并依赖 Workflow host 返回的 Resolve 版本、受管 Python 清单/可执行文件及隔离 Probe（`resolve-command-center/script-runtime/providers/PythonProvider.js:115`、`resolve-command-center/script-runtime/runtime/manager.js:278`）。
- 当前随包 Runtime Manifest 只声明了 Windows x64、Resolve `20.3.2` 前缀、CPython `3.13.14` 的已验证配置（`resolve-command-center/resources/runtimes/manifest.json:4`）。版本不匹配已有明确的 `unavailable` 映射；当前笼统错误更可能来自未映射的 host-version、manifest、spawn 或 Probe 异常，仍需用户环境事实确认。
- 内部 Beta 安装器会把 `win-unpacked/resources/app` 与 `win-unpacked/resources/runtimes` 合并到 Workflow 插件根目录，并校验完整安装清单；安装成功本身不能证明该用户机器可以启动受管 Python 或完成 Resolve bridge Probe（`resolve-command-center/scripts/internal-beta/ClacklyInstaller.psm1`）。
- 过去的真实验证基线是本机 Resolve `20.3.2.9` + CPython `3.13.14` + AE 2026；此前明确未完成跨机器安装包的 Settings/实际导出验收。
- 用户确认故障机器使用的 Resolve 版本应与开发机一致，且同为 Studio，因此本任务不扩展 Resolve 版本或版本类型支持范围。
- 用户进一步确认故障机器已启用 `External scripting: Local`，因此该前置条件不是本次失败根因。

## Requirements

- 找出安装包用户环境中 `ae.export` 状态探测抛出的原始错误及其所属边界，不以 AE 路径配置表象代替根因。
- 在共享状态/Runtime 边界做最小修复，使所有调用方获得一致行为；不得在 Settings renderer 中添加 `ae.export` 特判。
- 保留现有受管 Runtime 隔离、Manifest 选择、AE 路径校验、Command 绑定和导出结果契约。
- 对预期的用户环境失败返回稳定、可行动的 Feature Status；意外内部错误仍不得泄露敏感路径或任意底层异常文本到 renderer。
- 对现有受控 Runtime/Probe 错误保留稳定错误码，使重新打包后的用户截图足以区分 Resolve bridge、受管 Python 启动和包完整性分支；不得新增独立诊断框架。
- 第一版候选包用于取得用户机的精确受控错误码；若错误码指出仍有代码根因，则在同一任务内修复该根因并重新验证，不把“提示更清楚”误报为导出已恢复。
- 为根因增加一个最小可运行回归检查，并验证内部 Beta 打包产物路径。

## Acceptance Criteria

- [ ] 在与报告环境等价的已安装 Workflow 插件中，已配置有效 AE 路径时，`ae.export` 不再显示笼统状态错误。
- [ ] 若该环境受支持，Settings 显示 Ready 且 Export to After Effects Command 可执行。
- [ ] 若该环境不受支持或缺少运行条件，Settings 显示稳定、可行动且不泄露敏感信息的具体状态。
- [ ] 受控 Probe 失败不再退化为 `Unable to determine feature status.`，状态中包含可安全转述的稳定错误码；未知内部异常仍使用通用提示。
- [ ] 聚焦回归测试、完整测试、renderer build、Windows package verify 和内部 Beta package tests 通过。
- [ ] 至少完成一次安装后 Workflow 路径的真实或等价验证；无法在本机复现的用户机条件被明确记录。

## Out of Scope

- 重构通用 Feature Status 架构或 Settings UI。
- 添加第二套 Python Runtime 管理器、在线下载器或系统 Python 回退。
- 扩展到未经本任务明确确认的 Resolve/macOS/CPU 组合。
