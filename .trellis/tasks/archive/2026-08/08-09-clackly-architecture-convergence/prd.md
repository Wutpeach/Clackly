# Clackly 架构收口优化

## Goal

在现有架构已经成立的基础上完成一次小规模收口：两个 Host 共用主要 Application Composition，Script Feature readiness 能在执行前反映 Runtime 状态，同时保持当前功能行为与既有职责边界不变。

## Architectural Invariant

主链路必须保持：`Command → Capability → Execution Provider / Adapter → Script Runtime / Resolve / Shortcut / ...`。

- Command Engine 只负责纯编排，不感知 Resolve、Python、Workflow Plugin 或 Electron 实现。
- Capability 不重新承载宿主逻辑；Host-specific API 不进入共享 Core。
- 优先复用现有模块，只在真实重复或已确认断点处做最小修改。
- 每个 Phase 都补充或更新测试，完成后汇报并停止，下一阶段必须获得新的明确授权。

## Task Map and Ordering

1. `08-09-architecture-evidence`：Phase 0，只读取证、边界确认与质量基线。
2. `08-09-shared-application-composition-root`：Phase 1，依赖 Phase 0 结论，抽离共享 Composition Root。
3. `08-09-script-runtime-readiness`：Phase 2，依赖 Phase 1 完成，接通 Script Capability readiness。
4. `08-09-architecture-regression-and-closure`：Phase 3，依赖 Phase 1/2 完成，只做克制回归、文档与封板。

父任务保存完整需求和跨阶段验收；实际工作只在当前获批的子任务中进行。

## Requirements

- Phase 0 必须以仓库真实代码为准，产出 composition 对照、readiness 断点、预计修改文件、测试基线和风险，不做架构修改。
- Phase 1 必须建立轻量 application-level composition module，统一共享 Capability/Feature/Script wiring；Host 只准备 adapter/provider 与 lifecycle/IPC/window/Resolve integration。
- Phase 2 必须沿现有 FeatureStatusManager → Capability → Script provider/executor → Runtime provider → RuntimeManager probe 链路接通 readiness，不建立第二套 registry/status 模型。
- Phase 3 必须验证依赖方向、重复注册、循环依赖和完整质量基线，并更新架构文档。
- 所有阶段均需保留 Workflow Plugin、standalone Electron、marker capability 与现有 script capabilities 的行为。

## Out of Scope

- Plugin Marketplace、第三方动态 plugin loader、package manager、permissions、signature、sandbox。
- Lua、Node、shell runtime 或自动下载 Python。
- 通用 DI framework、Service Locator、Universal Executor Framework、复杂轮询系统。
- 为未来可能需要而重写现有模块或改变 Command Engine / Script protocol 的职责。

## Acceptance Criteria

- [ ] 两个 Host 共用主要 Application Composition，Host-specific integration 仍留在 Host。
- [ ] Script Feature readiness 能在 execute 前反映 Runtime 状态，FeatureStatusManager 不包含 runtime-specific 分支。
- [ ] `Command → Capability → Provider → Runtime/Host` 依赖方向无反转、无新增循环依赖。
- [ ] Electron、Workflow Integration、Resolve implementation、Python implementation 未污染共享 Core 或 Command Engine。
- [ ] 每阶段的目标测试、完整基线和 build 按计划通过；历史无关问题仅记录，不扩展重构范围。
- [ ] 每阶段完成后提交该子任务指定的汇报内容；Phase 1/2 必须包含 commit hash，并等待用户授权后才进入下一阶段。
- [ ] 最终文档明确 Host/Core 职责和普通 Python Feature 的真实开发路径。

## Blocking Questions

无。具体 API、可抽离组件和 readiness 断点由 Phase 0 仓库证据决定。
