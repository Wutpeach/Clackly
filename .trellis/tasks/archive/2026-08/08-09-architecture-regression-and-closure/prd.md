# Phase 3 — 架构回归、去重与封板

## Goal

验证 Phase 1/2 的最终依赖方向、启动与缓存语义及 Host/Core 边界，清理必要遗留并更新真实架构文档，随后正式封板本轮基础架构优化。若没有明确 regression，本阶段不修改 production code。

## Dependencies

Phase 1 Shared Application Composition Root 与 Phase 2 Script Runtime Readiness 已完成、通过测试并获批。

## Requirements

### Dependency Direction

- Command Engine 只负责 command lookup、capability lookup、enabled/config gate 与 execution orchestration；不得感知 Electron、Workflow Plugin、Resolve implementation、PythonProvider、RuntimeManager、python executable 或 Feature UI。
- FeatureStatusManager 只通过 `Capability.checkAvailability()` 获取状态，不得依赖 PythonProvider、RuntimeManager、resolver、probe subprocess 或 executable。
- Script Capability 可以知道 executor abstraction、executor metadata 与 runtime identifier，但不得 spawn、解析 python executable、管理 runtime payload 或读写 probe cache。
- PythonProvider 可以做 runtime-specific availability normalization，但不得依赖 renderer、Settings、Electron window 或 Feature UI。
- RuntimeManager 不得反向依赖 CapabilityRegistry、Command Engine、FeatureStatusManager 或 UI。
- Composition Root 可以 wiring application services，但不得承担 window/IPC/Electron lifecycle/Workflow lifecycle/Resolve startup recovery policy。

### Host Boundary

- 两个 Host 继续拥有 lifecycle、window、IPC、Resolve bootstrap/bridge、host-specific adapters、recovery、startup sequence、hostContextProvider 失败语义与 InteractionManager。
- InteractionManager 保持在 Host；不为去重引入 wrapper factory 或间接层。
- 两种 hostContextProvider 的 throw/null/fallback/logging/wrapping 语义不得统一或重解释。

### Composition and Runtime Source of Truth

- 搜索 shared constructors/registrations，人工区分 production wiring、Host-specific instance、validation registry 与 tests/fixtures；主要 Application Core production wiring 只有 `createClacklyCore` 一个 source of truth。
- `ScriptExecutor` 的同一个 providers Map 同时服务 execute 与 availability；不得出现 FeatureStatus/Python readiness 的第二套 registry。
- 只处理真实 production import cycle，不因概念上的双向关系新增 abstraction。

### Lazy Runtime and Cache Regression

- `createClacklyCore()`、application startup 与 Host startup 不得主动 probe、spawn runtime、launch feature script、desktop integration 或 AE integration。
- Readiness 只在显式 status refresh/availability check 时触发；首次 cache miss 的 resolve-probe 必须为 Promise/async subprocess，不得使用 spawnSync、execSync、busy wait 或同步轮询。
- 只验证首次 probe 最长 10 秒的既有风险，不增加 worker thread、daemon、poller 或 background service。
- cache path 保持 `%APPDATA%/Clackly/runtime-probe.json`，schemaVersion 保持 1；fingerprint、failure recovery、writer 数量与 last-writer-wins 语义不变。

### Behavioral Regression

- Marker backend precedence 保持显式既有顺序；backend execution 已开始后的业务/运行错误不得 fallback。
- Readiness 不替代 execute-time runtime validation。
- Host startup sequence 与 Resolve initialization timing 不变；Resolve startup freeze 完全 out of scope。
- Composition canary 验证架构意图：两个 Host 调 Root、Root 拥有 shared wiring、Core 不依赖 Host globals、Host 保留 lifecycle/window/IPC/InteractionManager；避免绑定行号、格式、import 顺序。

### Documentation

- 更新 README 或既有 architecture documentation，说明 Host Bootstrap → `createClacklyCore` → Application Core；Composition Root 是普通 factory，不是 DI framework。
- 记录 Command execution、Script execution 与 Script readiness 三条真实链路，并明确 readiness 不代替 execute-time validation。
- 明确 Host/Core responsibilities。
- 以仓库事实记录普通 Python Feature 的新增路径，包括 script、capability/feature metadata、command manifest、configuration/UI metadata 等实际必需步骤；明确通常无需修改 Command Engine、Host main.js 或 RuntimeManager。
- 给出 Stable Now、Intentionally Flexible 与 Future Trigger 三组封板结论。

### Validation

- 执行仓库现有 Node/Python tests、build、Trellis validation、composition canary 与 staged diff check。
- 仓库没有 lint/typecheck/CI 时如实记录，不为本阶段创建。
- 只修复 Phase 1/2 引入且有证据的 regression；其他发现仅作 future note。

## Out of Scope

不实现 DI Container、Service Locator、Universal Executor、Generic Plugin/Runtime Registry、Lua/Node/shell runtime、CPython downloader/updater、marketplace/package manager、permissions/signature/sandbox、runtime daemon、cache locking/namespace、Settings redesign、Resolve startup freeze fix、adapter rename、TypeScript/ESLint migration 或 CI redesign。

## Acceptance Criteria

- [ ] 两个 Host 共用主要 Application Composition，Host-specific lifecycle/failure policy 未污染 Core。
- [ ] Command Engine 保持纯 orchestration；FeatureStatusManager 不知道 runtime implementation。
- [ ] Script execute/readiness 共用同一个 Runtime Provider source of truth。
- [ ] Runtime readiness 未改变 startup/lazy semantics；首次 probe 为异步且复用既有 cache。
- [ ] Marker precedence/no-fallback、hostContextProvider、cache 与 startup 行为保持。
- [ ] Capability/Provider/Runtime 边界无反向依赖或新增真实 import cycle。
- [ ] 架构与 Python Feature 开发文档和真实代码一致。
- [ ] 完整 tests/build/validation 通过；production diff 为零或仅含已证明 regression 的最小修复。
- [ ] 默认策略切换为“开发真实 Feature → 暴露真实摩擦 → 局部修正”。

## Required Final Report

1. Dependency audit
2. Composition audit
3. Runtime readiness audit
4. Host boundary audit
5. Regression（Marker、hostContext、cache、startup 等）
6. Documentation 与普通 Python Feature 的真实新增路径
7. Architecture Freeze：Stable Now / Intentionally Flexible / Future Trigger
8. 完整 validation 结果及仓库不存在的门禁
9. 仅列真实 remaining risks
10. Phase 3 commit、task archive 与 journal hashes

完成后停止，不启动新的架构 Phase。

## Blocking Questions

无。
