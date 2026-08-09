# Phase 1 — 抽离共享 Application Composition Root

## Goal

基于已批准的 Phase 0 证据，抽离两个完整 Electron Host 中重复的 Application Core wiring，使其只有一个主要 source of truth。目标不是把 Workflow Host 强行改造成薄插件入口；两个 Host 继续完整拥有自己的 Electron lifecycle、window/IPC、Resolve bootstrap 和 host-specific recovery/error handling。

## Dependency

本任务只能在 Phase 0 报告获批后启动；真实抽离组件、目录、参数名和修改文件必须用 Phase 0 结论更新，不以本计划示例强行决定。

## Requirements

- Phase 0 候选清单包括 CapabilityRegistry、CommandExecutor、ScriptExecutor、ScriptCapabilityProvider、runtime-related application services、FeatureCatalog、FeatureStatusManager、ConfigManager、InteractionManager 和共享 Capability registration；只有 Phase 0 逐项确认为 application-level shared wiring 的组件才由新 Composition Root 负责。
- Host-backed storage、runtime construction 或任何直接依赖宿主 API 的候选允许保留在 Host，并作为普通 provider/adapter dependency 注入 Root。
- Host 创建 Host-specific adapters/providers、准备依赖、调用 Composition Root，并完整保留 lifecycle、IPC、window、Resolve integration、startup sequencing 与 recovery/error handling。
- 共享 Feature/Capability registration 只能有一个主要来源；Host 差异以普通参数注入，不复制完整 registration。
- 不改变 `Command → Capability → Provider` 调用关系，不扩大 Command Engine 或 Capability API 职责。
- 保持 Workflow Plugin、standalone Electron、marker capability 和 script capabilities 的现有行为。
- `hostContextProvider` 由 Host 注入；Root 只能消费，不得统一或重新解释两个 Host 原有的 throw、null/fallback、logging、error wrapping 或 retry 语义。两个 Host 的失败路径必须有回归测试。
- Marker backend precedence 固定为代码中现有明确顺序；多个 backend 同时 available 时仍选原最高优先级，execution 已开始后的业务错误不得 fallback。不得依赖 object/map insertion order 作为隐式规则，也不得无必要重写 selection。
- `%APPDATA%/Clackly`、runtime-probe cache path、manager/cache 实例数、初始化次数、写入时机、probe lifecycle 与 lazy timing 全部保持不变；Root 不得额外创建 cache/runtime manager。
- Phase 0 composition canary 必须迁移为验证“两个 Host 调用共享 Composition Root”，并最小化对变量名、源码位置、格式和 import 顺序的绑定；不得删除 canary 或新建 architecture-test framework。
- 如移动初始化代码，必须证明调用时机、次数和异常行为不变；不得提前初始化 runtime/Resolve、提前 probe、改变 Workflow startup sequence 或把 lazy initialization 改为 eager。

## Out of Scope

- 不引入 Inversify、Awilix、Nest-style DI、复杂 ServiceContainer、全局 Service Locator。
- 不把 Electron API、Workflow Integration API、Resolve bridge 或 Host lifecycle 放进 Core。
- 不为 marketplace 或未来 plugin lifecycle 设计抽象，不为“优雅”重写现有模块。
- 不重命名 `resolve/adapter.js` 或 `resolve/adapter.py`；仅在 Composition Root 确有需要时做必要修改。
- 不改变共享 appData/cache 布局，不引入 per-host directory、cache namespace、file lock、database、cross-process synchronization 或 runtime daemon。
- 不引入 ESLint、TypeScript、CI、pre-commit hooks；lint/typecheck/CI 缺口只记为 engineering infrastructure backlog。
- Resolve startup freeze 完全 out-of-scope，不调整 Resolve connection 或 Workflow Integration 初始化路径。

## Acceptance Criteria

- [ ] `createClacklyCore(mockDependencies)`（最终命名可按仓库规范调整）返回可工作的 command executor、capability registry、feature services 和 script services。
- [ ] Workflow 与 Electron 不再重复创建 Phase 0 识别的主要 Application Core。
- [ ] Host-specific integration 仍留在各自 Host，Core 可在无 electron/window/Resolve globals 的测试环境加载和创建。
- [ ] Feature/Capability 共享注册不存在两套主要逻辑。
- [ ] Command Engine 业务职责和 Capability API 无大规模变化。
- [ ] 两个 Host 的 hostContextProvider 失败行为、Marker precedence 与 execution-error no-fallback 行为均由测试证明不变。
- [ ] appData/cache path、runtime/cache manager 数量、初始化/写入/probe 时机和 startup sequence 均未变化。
- [ ] 新 canary 验证 Host → Composition Root 架构意图且未过度绑定源码格式。
- [ ] Workflow、Electron、marker 与 script regression tests 通过，build 通过。

## Required Report

1. 修改前 composition。
2. 修改后 composition。
3. 新 Composition Root API。
4. 由 Host 注入的 dependencies。
5. 删除的重复 wiring。
6. 测试结果。
7. 是否存在行为变化。
8. commit hash。

提交以上一次性汇报后停止，不继续 Phase 2。

## Blocking Questions

无。Phase 0 报告与本轮新增约束已获用户批准；实际 Root 参数仍以 dependency graph 的最小集合为准。
