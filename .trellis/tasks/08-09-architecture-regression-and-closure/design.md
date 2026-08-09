# Design — Architecture Regression and Closure

## Review Model

本阶段不引入新 production abstraction。它以静态 import/constructor/registration 搜索、运行时测试和文档核对三类证据确认边界。

## Expected Final Architecture

```text
Host Bootstrap
  → Application Composition Root
  → Command Engine
  → Capability Registry
  → Capability
  → Provider / Adapter
  → Runtime / Resolve / Shortcut
```

## Stable Boundaries to Evaluate

- Command Engine 的纯编排职责。
- Capability 通过 provider/adapter 执行的契约。
- Host lifecycle/API 与共享 Core 的隔离。
- Script availability 通过 runtime provider/probe 暴露的通用链路。

## Intentionally Flexible

- Composition Root 的普通 dependency 参数可随真实 Feature 增加，但不预设 container/plugin lifecycle。
- Runtime provider lookup 保留现有扩展点，但没有第二种 runtime 前不再泛化。
- Feature manifests 保留当前扩展方式，第三方 package 未出现前不设计 package/security system。

## Minimal Fix Rule

若回归发现 Phase 1/2 引入的问题，仅在最接近根因的层修正；若发现未来机会，写入 future notes 而不实现。

## Rollback

文档与最小回归修复形成独立 Phase commit。重大问题优先回滚对应 Phase 1/2 commit，而非在 Phase 3 再造抽象补救。
