# Phase 0 — 架构取证与重构边界确认

## Goal

在修改产品架构前，用仓库证据确认 Workflow Plugin Host 与 standalone Electron Host 的 composition 重复，以及 Script Capability / Runtime readiness 的真实数据流和当前测试基线。

## Requirements

### Host Composition

- 检查 `workflow-plugin/main.js`、`electron/main/main.js` 及其引用模块。
- 对 Resolve Adapter/Provider、ShortcutManager、CapabilityRegistry、MarkerCapability、ScriptExecutor、RuntimeManager、ScriptCapabilityProvider、FeatureCatalog、ConfigManager、FeatureStatusManager、CommandExecutor、InteractionManager 和其他 application-level services 制作对照表。
- 对每个组件记录：Workflow Host 是否创建、Electron Host 是否创建、参数差异、是否属于共享 Core、是否属于 Host-specific Adapter。
- 判断 Application Core Composition、Host Bootstrap、Electron API dependency、Resolve Workflow Integration dependency 以及可安全抽离项。

### Script Runtime Readiness

- 追踪 `FeatureStatusManager → Capability.checkAvailability() → Script Capability → ScriptCapabilityProvider → ScriptExecutor → Runtime Provider → PythonProvider → RuntimeManager → runtime probe`。
- 确认 Script Capability 是否已有 `checkAvailability`、PythonProvider 的 probe/readiness 能力、RuntimeManager probe 返回结构和现有缓存/状态。
- 确认现有 Feature Status 对 `ready`、`loading`、`missing-config`、`missing-dependency`、`unavailable`、`error` 的真实映射，并寻找可复用错误类型。

### Baseline

- 从仓库配置确认并运行现有 unit、integration、lint、typecheck（如存在）、build 和其他相关 CI job。
- 记录命令、通过/失败、失败证据及是否为历史问题；不为无关问题做额外重构。
- 添加或更新最小 characterization test，固化本阶段识别的关键现状；测试不得改变产品行为，也不得借机进行架构修改。

## Out of Scope

- 不设计或实现 Composition Root、marketplace、DI framework、新 runtime abstraction 或任何 Phase 1/2 代码。
- 不因预设架构与仓库不同而强行修改代码；以实际代码为准并明确差异。

## Required Report (and Acceptance Criteria)

1. [ ] 当前 architecture composition 图。
2. [ ] Workflow/Electron duplication 清单和完整组件对照表。
3. [ ] 建议抽到 Composition Root 的模块，并给出代码证据。
4. [ ] 必须保留在 Host 内的模块，并给出代码证据。
5. [ ] Script Runtime readiness 当前断点，包括状态、错误和缓存现状。
6. [ ] Phase 1/2 预计需要修改的文件。
7. [ ] 测试基线，以及本阶段新增/更新的最小 characterization tests。
8. [ ] 发现的风险，包括预设与仓库实际差异。

汇报只包含上述八项，不开始 Phase 1。对 Phase 1/2 artifact 的修订只是基于证据的提案，必须经用户批准后才成为后续实施计划。

## Blocking Questions

无；所有未知项均由仓库取证回答。
