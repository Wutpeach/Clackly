# Implementation Plan — Phase 1

1. 读取并引用 Phase 0 research，锁定共享项、Host-specific 项、构造参数和预计文件。
2. 在重构前锁定兼容性：两个 hostContextProvider 的失败语义；Marker 当前显式 precedence、多个 backend 同时 available 的选择、execution error no-fallback；appData/cache path、RuntimeManager/probe 构造次数与 startup timing。
3. 添加 Core creation 与 Host isolation tests，证明期待的 composition、禁止的 globals/imports，以及两个 Host 仍各自持有完整 bootstrap。
4. 在现有目录规范下新增单个轻量 Composition Root factory，其输入/输出只包含 Phase 0 已确认的真实依赖。
5. 仅将 Phase 0 确认的共享 application services 与 Capability/Feature registration 移入 factory，不改变内部业务模块。
6. Workflow Host 保留 Resolve/Workflow-specific dependencies、完整 Electron lifecycle、IPC/window/startup/recovery，原时机调用 factory。
7. Electron Host 保留 bridge-specific dependencies、完整 Electron lifecycle、IPC/window/startup/recovery，原时机调用同一 factory。
8. 保持 hostContextProvider、Marker selection、appData/cache/runtime/probe lifecycle 的原始实现与时序；不得新增 eager work 或重复 manager/cache。
9. 将 composition canary 最小迁移为检查 Host 调用共享 Root 和共享 wiring 的单一 source of truth；同步复核 stage-managed-python canary。
10. 删除已被 factory 取代的 Host wiring；搜索并人工判断剩余构造是否为 fixture、Host bootstrap 或 Host-specific。
11. 运行 Core creation、Host isolation、Workflow/Electron、marker/script、startup/cache regressions、完整 `npm test`、`npm run build` 和 Trellis validation。仓库无 lint/typecheck/CI，不新增门禁。
12. 提交 Phase commit，汇报八项指定内容并停止，不启动 Phase 2。

## Rollback Points

- 若单个 service 无法脱离 Host API，撤回该 service 的抽离并记录原因，不扩展 adapter framework。
- 若 Root API 需要大量 optional flags，重新按 Phase 0 ownership 缩小抽离范围。
- 若任何移动改变初始化时机、次数、失败语义或 Resolve startup sequence，回滚该移动并将该内容留在 Host。

## Review Gate

确认 shared registration 只有一个主要来源，Core 模块静态/运行时均不依赖 electron、window 或 Resolve Workflow globals；两个 Host 失败语义、Marker precedence、cache/runtime lifecycle 和 startup behavior 均由回归测试证明不变。
