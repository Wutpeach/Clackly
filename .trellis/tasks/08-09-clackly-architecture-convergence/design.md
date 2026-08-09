# Design — Clackly 架构收口优化

## Boundary

本任务不是重新设计架构，而是把已经存在的职责关系收敛到单一 wiring 来源，并让既有 runtime probe 成为 Script Feature lifecycle 的事实来源。

```text
Host Bootstrap
  → Application Composition Root
  → Command Engine
  → Capability Registry
  → Capability
  → Provider / Adapter
  → Runtime / Resolve / Shortcut
```

Phase 0 负责验证此模型与仓库实际代码是否一致；如果不一致，后续设计以证据更新，不强迫代码符合预设名称或目录。

## Responsibility Split

| Layer | Responsibility |
| --- | --- |
| Host Bootstrap | Electron/Workflow lifecycle、window/IPC、Resolve bridge、native host adapter/provider 构造 |
| Application Composition Root | 创建共享 application services，连接依赖，执行单一来源的 Feature/Capability registration |
| Command Engine | 命令编排与分派，不知道具体宿主和 runtime |
| Capability | 暴露能力、执行与 availability 契约，不直接操作宿主/runtime 可执行文件 |
| Provider / Adapter | 将稳定能力契约映射到 Resolve、Shortcut、Script Runtime 等具体实现 |
| Runtime Provider | probe/执行/错误归一化，不依赖 UI |

## Readiness Target to Verify in Phase 0

```text
FeatureStatusManager
  → Capability.checkAvailability()
  → Script Capability / ScriptCapabilityProvider
  → existing runtime lookup in ScriptExecutor/provider map
  → Runtime Provider
  → PythonProvider
  → RuntimeManager / existing runtime probe collaborator
```

这是用户期望的概念链，不声明仓库已经存在同名公开方法。Phase 0 必须区分 capability probe result 与 FeatureStatusManager 自身 lifecycle state，并确认每层真实 API 后再确定最小委托点。Feature Status 只消费稳定 availability；它不包含 `runtime === "python"` 分支。缓存只在 Phase 0 证明现有状态不足时做最小补充，并必须可在安装/配置、初始化或失败后刷新。

## Compatibility and Rollback

- 先写 characterization/composition tests，再移动 wiring。
- 每个 Phase 独立提交；回滚以阶段 commit 为边界。
- Host entry points 与现有 manifests/protocol 保持兼容。
- 若某个 service 实际依赖 Host API，则保留在 Host，不为追求统一强行抽离。

## Deferred Triggers

- 只有第二种真实 runtime 出现时，才评估进一步的 runtime registration abstraction。
- 只有第三方 Feature Package 出现时，才设计 package、permissions、versioning 与 marketplace。
