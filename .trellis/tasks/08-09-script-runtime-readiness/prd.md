# Phase 2 — Script Capability 接入 Runtime Readiness

## Goal

让 Script Feature lifecycle 在执行命令前即反映其 runtime 是否可用，避免 Settings 显示 Ready 而执行时才发现 Python runtime unavailable。

## Dependencies

- 必须在 Phase 0 确认 readiness 断点、probe 契约、状态模型和缓存现状后更新本计划。
- 必须在 Phase 1 完成并获批后启动，使用共享 composition 中的既有 script/runtime wiring。

## Target Data Flow

概念链为 `FeatureStatusManager → Capability.checkAvailability() → Script Capability → ScriptCapabilityProvider → ScriptExecutor/existing runtime lookup → Runtime Provider → PythonProvider → RuntimeManager / existing runtime probe/cache`。FeatureStatusManager 不知道 Python、RuntimeManager implementation 或 executable；Script Capability 不 spawn、读 filesystem payload 或操作 executable。

## Requirements

- Script Capability 根据自身 `executor.runtime` 使用现有 ScriptExecutor/provider map 找到 runtime provider 并查询 availability；不得建立另一套 runtime registry。
- 实现前必须先完成小范围取证并提交 mapping table：provider readiness API、executor lookup、PythonProvider runtime 获取、RuntimeManager probe/cache、key/lifecycle/invalidation、probe 是否 spawn/start runtime、FeatureStatus checkAvailability 契约、稳定 reason/details、unknown runtime execute 语义。
- FeatureStatusManager 不知道 Python，Script Capability 不直接操作 Python executable，UI 只消费稳定 status/reason。
- Runtime Provider 负责将底层 probe/error 归一化为现有 Feature Status 可消费的信息，尽量复用 AudioRuntimeError、ScriptRuntimeError、RuntimeManager error 和现有 reason/details。
- 按实际模型处理 `ready`、`loading`、`missing-config`、`missing-dependency`、`unavailable`、`error`，并明确哪些来自 capability probe、哪些由 FeatureStatusManager lifecycle 派生；不得新建第二套 status enum 或强迫 probe 返回所有最终状态。
- Settings 高频读取不得触发每次 render 都 spawn Python、probe filesystem 或启动 runtime；优先复用现有 cached probe/runtime/initialization state。
- 只有现有状态不足时添加最小缓存，并在 runtime installation/config change、initialization 和 failure 后可失效/刷新。
- 必须区分 availability probe 与 runtime initialization/start；不得让 createClacklyCore 或 application startup 产生 eager Python/Resolve probe，不得改变 Phase 1 已锁定的 lazy timing。
- 两 Host 继续共享现有 runtime-probe cache；path/schema/writer count/last-writer-wins 不变，不新增 Host cache、locking、namespace、daemon 或第二套 FeatureStatus cache。
- Unknown runtime 必须返回稳定 non-ready availability，同时保持 execute path 现有 unknown-runtime 错误语义。
- Readiness 只提前提供状态，不取代 execute-time validation；availability 后的 TOCTOU failure 仍由原执行错误路径处理。
- 两 Host 使用同一 Script readiness wiring；Composition Root public API 原则上不变，只允许证明确有必要的最小 wiring 调整。
- 不重新设计 Settings UI，只确保现有状态和 reason 正确。

## Out of Scope

- 不新增 Lua、Node、shell runtime，不实现 sandbox、自动下载 Python、后台 polling。
- 不改变 RuntimeManager 整体生命周期、Script protocol 或所有 FeatureStatus。
- 不实现 CPython payload distribution/downloader/updater、marketplace、plugin package、generic Executor/RuntimeProvider registry framework、cross-process locking/daemon、Settings UI redesign、Resolve freeze fix、adapter rename、lint/typecheck/CI infrastructure。

## Acceptance Criteria

- [ ] `python ready` 在 execute 前映射为现有 ready 状态。
- [ ] `python missing` 映射为仓库现有 missing-config 或 missing-dependency 语义中的正确一种，并有稳定 reason/details。
- [ ] `python initializing` 映射为 loading。
- [ ] `python probe error` 映射为 error，底层字符串不散落到 UI/Capability/Runtime 多处。
- [ ] `unknown runtime` 映射为现有 unavailable/error 契约中的正确状态，不崩溃。
- [ ] 普通 native capability 的 availability 与执行不受影响。
- [ ] Settings/status 高频读取不会重复昂贵 probe；缓存如有新增具备必要失效路径。
- [ ] Readiness 不改变 provider precedence、execute result 或吞掉 runtime execution error；至少一个 Marker native capability regression 通过。
- [ ] 两 Host 复用同一 readiness wiring，Composition Root 边界未扩大，startup/lazy timing 未变化。
- [ ] cache path/schema/writer count 与共享 last-writer-wins 语义未变化。

## Required Report

1. 修改前 readiness 链。
2. 修改后 readiness 链。
3. Runtime probe → Feature Status 明确映射表。
4. API 变化：Script Capability、ScriptCapabilityProvider、ScriptExecutor、PythonProvider、RuntimeManager，含保持不变项。
5. Probe/cache 行为：首次、重复、invalidation、spawn、lazy timing、共享 path/schema。
6. 新增测试及完整测试结果。
7. Regression：native capability、Marker precedence、Host startup、Composition Root、execute-time validation。
8. 真实剩余风险。
9. commit hash；工作树干净。

提交以上一次性汇报后停止，不继续 Phase 3。

## Blocking Questions

实现前 mapping table 尚待当前代码取证确认。若 availability 无法与 runtime initialization 区分，或必须修改 cache schema/Root public API，先停止并汇报，不自行扩大设计。
