# Design — Shared Application Composition Root

## Target Shape

```text
Workflow Electron App ─ host bootstrap/adapters ─┐
                                                 ├─ createClacklyCore(dependencies)
Standalone Electron App ─ host bootstrap/adapters┘             │
                                                                ├─ Command Engine
                                                                ├─ Capability Registry
                                                                ├─ Feature services
                                                                └─ Script/runtime application wiring
```

`createClacklyCore` 是普通 factory/application wiring，不是 container 或 framework。最终位置和名称遵循 Phase 0 发现的现有目录规范。

两个 Host 仍然是完整 Electron apps。main.js 是否明显变短不是成功指标；共享 Application Core wiring 是否只有一个主要 source of truth 才是成功指标。

## Proposed Contract

输入是 Phase 0 识别出的 Host-specific provider/adapter 与必要配置；输出是 Host lifecycle/IPC 需要引用的共享 application services。所有参数和返回项都必须来自当前调用者的真实需要，不添加 future-facing hooks。

## Ownership Rules

- 两个 Host 以相同规则创建/注册的内容进入 Root。
- 直接 import Electron、Resolve Workflow Integration、window/native globals 的内容保留在 Host 或 Host adapter。
- Runtime implementation 可由 Host 构造后注入；Root 只做已存在的 application orchestration。
- Shared registration 移入 Root 后删除 Host 副本，但保留测试 fixture 中合理的独立构造。
- `registerFeatureUiIpc` invocation、IPC handlers、composeStartup、window/hotkey、single-instance/app lifecycle 永远属于 Host bootstrap，即使两个 Host 当前逐字重复。

## Compatibility

- Host 外部 lifecycle、IPC channel、manifest、command/capability id 与执行语义不变。
- 优先通过 characterization tests 锁定构造结果，再移动 wiring。
- 如 Phase 0 发现两个 Host 并非同一产品能力集合，保留明确的 optional injected dependency，不伪造统一。
- Root 透传/消费 Host dependencies，不改变 hostContextProvider 的失败策略。
- Marker backend 的显式优先级为不可变业务行为；继续复用现有 selection 实现。
- `%APPDATA%/Clackly`、runtime-probe cache、RuntimeManager/Probe 初始化次数和 lazy startup timing 不变。
- composition canary 改为检查两个 Host 引用并调用 Root，以及 Root 拥有共享 wiring；只绑定稳定架构意图。

## Deferred Backlog

- 共享 cache 的 last-writer-wins 与跨进程同步。
- `resolve/adapter.js` / `resolve/adapter.py` 命名可发现性。
- lint、typecheck、CI gate。
- Resolve startup freeze（独立既有调查）。

## Rollback

Composition Root 与两个 Host adaptation 作为一个 Phase commit；失败时可整体回滚，不要求迁移数据。
