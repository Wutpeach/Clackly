# Phase 2 — Script Capability 接入 Runtime Readiness

## Goal

让 Script Feature lifecycle 在执行命令前即反映其 runtime 是否可用，避免 Settings 显示 Ready 而执行时才发现 Python runtime unavailable。

## Dependencies

- 必须在 Phase 0 确认 readiness 断点、probe 契约、状态模型和缓存现状后更新本计划。
- 必须在 Phase 1 完成并获批后启动，使用共享 composition 中的既有 script/runtime wiring。

## Target Data Flow (Phase 0 Must Confirm Actual APIs)

概念链为 `FeatureStatusManager → Capability.checkAvailability() → Script Capability → ScriptCapabilityProvider → ScriptExecutor/existing runtime lookup → Runtime Provider → PythonProvider → RuntimeManager / existing runtime probe`。这不要求新增名为 `RuntimeManager.probe()` 的公开方法；Phase 0 应确认 probe collaborator、返回结构和最小可复用委托点。

## Requirements

- Script Capability 根据自身 `executor.runtime` 使用现有 ScriptExecutor/provider map 找到 runtime provider 并查询 availability；不得建立另一套 runtime registry。
- FeatureStatusManager 不知道 Python，Script Capability 不直接操作 Python executable，UI 只消费稳定 status/reason。
- Runtime Provider 负责将底层 probe/error 归一化为现有 Feature Status 可消费的信息，尽量复用 AudioRuntimeError、ScriptRuntimeError、RuntimeManager error 和现有 reason/details。
- 按实际模型处理 `ready`、`loading`、`missing-config`、`missing-dependency`、`unavailable`、`error`，并明确哪些来自 capability probe、哪些由 FeatureStatusManager lifecycle 派生；不得新建第二套 status enum 或强迫 probe 返回所有最终状态。
- Settings 高频读取不得触发每次 render 都 spawn Python、probe filesystem 或启动 runtime；优先复用现有 cached probe/runtime/initialization state。
- 只有现有状态不足时添加最小缓存，并在 runtime installation/config change、initialization 和 failure 后可失效/刷新。
- 不重新设计 Settings UI，只确保现有状态和 reason 正确。

## Out of Scope

- 不新增 Lua、Node、shell runtime，不实现 sandbox、自动下载 Python、后台 polling。
- 不改变 RuntimeManager 整体生命周期、Script protocol 或所有 FeatureStatus。

## Acceptance Criteria

- [ ] `python ready` 在 execute 前映射为现有 ready 状态。
- [ ] `python missing` 映射为仓库现有 missing-config 或 missing-dependency 语义中的正确一种，并有稳定 reason/details。
- [ ] `python initializing` 映射为 loading。
- [ ] `python probe error` 映射为 error，底层字符串不散落到 UI/Capability/Runtime 多处。
- [ ] `unknown runtime` 映射为现有 unavailable/error 契约中的正确状态，不崩溃。
- [ ] 普通 native capability 的 availability 与执行不受影响。
- [ ] Settings/status 高频读取不会重复昂贵 probe；缓存如有新增具备必要失效路径。

## Required Report

1. readiness 调用链。
2. Runtime probe → Feature Status 映射表，并区分 probe result 与 manager lifecycle state。
3. 新增或修改的 API。
4. 是否增加缓存及原因。
5. 测试列表。
6. 测试结果。
7. 行为变化。
8. commit hash。

提交以上一次性汇报后停止，不继续 Phase 3。

## Blocking Questions

精确 status/reason 字段与错误类型由 Phase 0 证据决定，不允许凭空定义。
