# 自动发现并保存 After Effects 路径

## Goal

让 Windows 用户首次启动 Clackly 时无需手动配置 After Effects 可执行文件路径：当 `ae.export` 的已保存路径缺失或失效时，Clackly 调用该 Feature 的发现逻辑，保存有效结果，并在设置页展示；之后启动和导出直接复用已保存配置。

## Background

- `ae.export` 当前将 `aePath` 声明为必填配置，缺少时会在脚本执行前被 Clackly 配置检查拦截。
- Resolve2AE 核心已有“从正在运行的 AE 进程读取路径”的能力，但当前仅用于判断 AE 是否运行，未用于 Clackly 配置初始化。
- 本机验证可通过正在运行的进程、Windows `App Paths\\AfterFX.exe` 注册表项及 Adobe 标准安装目录定位同一个 AE 2026 可执行文件。
- Clackly 继续拥有配置生命周期与持久化；`ae.export` 拥有 AE 特定的发现规则。插件不得直接读写 Clackly 配置文件。

## Requirements

- Clackly 启动并完成 Feature/Config 初始化后，仅在 `ae.export.aePath` 缺失、为空或指向不存在文件时执行自动发现。
- 发现顺序必须可预测：有效的已保存路径优先；否则依次尝试正在运行的 AE、Windows `App Paths` 注册表、Adobe 标准安装目录。
- 自动发现结果必须经过文件存在性验证后，由 Clackly `ConfigManager` 写入 `ae.export` 的配置作用域。
- 设置页读取现有配置接口后必须直接显示自动保存的路径，无需另建 AE 专用 UI 状态。
- 后续启动复用有效的已保存路径；AE 升级、卸载或移动导致路径失效时，必须重新发现并更新。
- `After Effects Path` 保留现有必填配置语义和手动 Browse 控件；自动发现负责在正常安装场景下预先填充它，用户可保存其他有效路径作为覆盖。
- 自动发现失败不得写入空值或猜测路径；Feature 应保持可恢复状态并允许用户手动选择文件。
- 首版仅支持当前产品目标平台 Windows，不扩展 macOS 自动安装发现。

## Acceptance Criteria

- [ ] 新用户在标准安装 AE 的 Windows 机器上首次启动 Clackly 后，`ae.export.aePath` 自动写入 Clackly 配置文件，设置页显示同一路径。
- [ ] 已保存路径有效时，重启 Clackly 不覆盖用户选择，也不执行不必要的重新发现。
- [ ] 已保存路径失效时，重启 Clackly 能发现新的有效 AE 路径并更新配置与设置页显示。
- [ ] AE 正在从非标准路径运行时，该运行实例路径优先于注册表和标准目录结果。
- [ ] 多个标准安装版本存在时，发现规则稳定选择最高版本；用户手动保存其他有效版本后，该选择保持优先。
- [ ] 未安装 AE 或所有候选均无效时，不保存猜测值；设置页保持现有 missing-config 提示和手动浏览选择，导出继续受必填配置门禁保护。
- [ ] 自动发现和持久化有最小可运行测试，现有 Resolve2AE 导出测试、配置测试和设置页测试继续通过。

## Out of Scope

- 全局 After Effects Runtime 服务或向所有 Feature 广播 AE 路径。
- 多版本 AE 下拉列表、版本管理或自动迁移 Adobe 安装。
- 插件直接修改 Clackly 配置文件。
- macOS 自动安装发现。
