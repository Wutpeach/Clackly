# Design — Architecture Regression and Closure

## Review Model

本阶段不引入新 production abstraction。以静态 import/constructor/registration 搜索、真实 import-cycle 检查、运行时测试和文档核对四类证据确认边界。默认 production diff 为零；只有可归因于 Phase 1/2 的明确 regression 才做最小修复。

## Expected Final Architecture

```text
Host Bootstrap
  → Application Composition Root
      ├→ Command Engine → Capability Registry → Capability → Provider / Adapter
      └→ Feature services → Capability.checkAvailability()

Script Capability
  → ScriptCapabilityProvider
  → ScriptExecutor (single providers Map)
  → PythonProvider
  → RuntimeManager
  → Resolver / Probe / cache
```

Composition Root 是普通 factory，不是 DI framework。Host 保留 lifecycle、window、IPC、Resolve bootstrap、recovery、InteractionManager 与 hostContextProvider policy。

## Stable Boundaries to Evaluate

- Command Engine 的纯编排职责。
- Capability 通过 provider/adapter 执行的契约。
- Host lifecycle/API 与共享 Core 的隔离。
- Script availability 通过 runtime provider/probe 暴露的通用链路。
- Script execute 与 readiness 共用同一个 provider source of truth。
- Runtime startup 保持 lazy；availability 只在显式 refresh 时异步 probe。
- Marker precedence/no-fallback、hostContextProvider 失败语义与共享 cache schema/path 保持不变。

## Intentionally Flexible

- Composition Root 的普通 dependency 参数可随真实 Feature 增加，但不预设 container/plugin lifecycle。
- Runtime provider lookup 保留现有扩展点，但没有第二种 runtime 前不再泛化。
- Feature manifests 保留当前扩展方式，第三方 package 未出现前不设计 package/security system。

## Minimal Fix Rule

若回归发现 Phase 1/2 引入的问题，仅在最接近根因的层修正；若发现未来机会，写入 future notes 而不实现。

## Audit Evidence

- import/reference audit：逐层检查禁止依赖，并区分概念关系与真实 module cycle。
- composition audit：shared constructors/registrations 只在 Root 生产 wiring；Host-specific 与 fixtures 保留。
- lazy/probe audit：构造与 startup 零 probe，显式 refresh 使用 async spawn，execute-time validation 仍在。
- cache audit：同一 RuntimeProbe/RuntimeProbeCache、同一路径、schemaVersion 1、既有 fingerprint/invalidation/writer 语义。
- canary/test audit：保留架构意图断言，不建新 architecture-test framework。

## Rollback

文档与最小回归修复形成独立 Phase commit。重大问题优先回滚对应 Phase 1/2 commit，而非在 Phase 3 再造抽象补救。
