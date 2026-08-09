# Phase 3 — 架构回归、去重与封板

## Goal

对 Phase 1/2 做一次克制的架构回归，确认 `Command → Capability → Provider → Runtime` 边界未产生反向依赖、重复注册或循环依赖，更新真实架构文档并封板本轮优化。

## Dependencies

只有 Phase 1 与 Phase 2 分别完成、测试通过并获批后才可启动。

## Requirements

### Dependency Direction

- Command Engine 不 import Electron、Workflow Plugin、Resolve API implementation、PythonProvider 或 RuntimeManager implementation。
- Capability 不直接操作 Electron IPC、child_process、Python executable 或 Workflow Integration API；明确且符合既有设计的 Host-specific capability 除外。
- Runtime Provider 不依赖 UI。
- FeatureStatusManager 不包含 `if runtime === "python"` 等 runtime-specific 分支。

### Duplication and Cycles

- 搜索 `new CapabilityRegistry`、`new CommandExecutor`、`new ScriptExecutor`、`registerScriptCapabilities`、`registerMarkerCapability`、`FeatureStatusManager`、`FeatureCatalog`，人工区分 Host duplication 与合理测试 fixture。
- 检查并消除本轮引入的 `core → host → core`、`capability → application → capability`、`runtime → feature-status → runtime` 等循环，只做最小调整。

### Documentation

- 更新架构文档/README，描述 Host Bootstrap → Application Composition Root → Command Engine → Registry → Capability → Provider/Adapter → Runtime/Resolve/Shortcut。
- 明确 Host responsibilities：Electron/Workflow lifecycle、window/IPC、Resolve host bridge、native host adapters。
- 明确 Core responsibilities：command orchestration、capability registration、feature lifecycle、script capability wiring、runtime provider orchestration。
- 记录普通 Python Feature 的真实开发路径；预期为 Python script + Capability manifest + Command manifest，如仓库另有必需步骤则以事实补充。

### Validation

- 运行完整 unit、integration、lint、typecheck、build 和其他存在的 CI job。
- 只修复 Phase 1/2 引入的问题；未来扩展机会记录为 future notes。

## Out of Scope

不实现 Plugin Marketplace、dynamic third-party loader、package manager、permissions、signature、sandbox、Lua/Node/shell runtime、Generic DI Framework 或 Universal Executor Framework。

## Acceptance Criteria

- [ ] 两个 Host 共用主要 Application Composition，Host-specific API 未污染 Core。
- [ ] Script readiness 正确反映 Runtime 状态，Command Engine 仍为纯编排。
- [ ] Capability/Provider/Runtime 边界无反向依赖或新增循环依赖。
- [ ] Host-level 主要注册无不必要重复，测试 fixture 未被机械删除。
- [ ] 架构/Feature 开发文档与实际代码一致。
- [ ] 完整质量基线通过；无关历史问题仅记录。
- [ ] 最终评估分别列出 Stable now、Still intentionally flexible、Future trigger。
- [ ] 汇报后将默认策略明确为“优先真实 Feature，痛点出现后再局部抽象”。

## Required Final Report

1. 最终 architecture composition 与依赖方向检查结论。
2. 剩余 production registration 与已确认合理的 test fixtures。
3. 循环依赖检查及所有最小修正。
4. 文档更新与普通 Python Feature 的真实开发路径。
5. 完整 unit、integration、lint、typecheck、build 和其他 CI 结果。
6. 是否存在行为变化及本阶段 commit hash。
7. **Stable now**：本轮已封板的边界。
8. **Still intentionally flexible / Future trigger**：保留的扩展点及只有哪些真实需求出现时才继续抽象。

提交最终汇报后停止本轮架构优化，不继续主动设计框架层。

## Blocking Questions

无；具体检查路径和文档位置由 Phase 0/1/2 产物及仓库证据决定。
