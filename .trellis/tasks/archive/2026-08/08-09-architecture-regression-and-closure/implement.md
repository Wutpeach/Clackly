# Implementation Plan — Phase 3

1. 对照 Phase 0 evidence 与 Phase 1/2 commits，画出最终 import/runtime dependency map，并逐项审计 Command Engine、FeatureStatusManager、Script Capability、PythonProvider、RuntimeManager 与 Composition Root 的禁止依赖。
2. 审计两个 Host 的 ownership，确认 lifecycle/window/IPC/Resolve bootstrap/recovery/InteractionManager/hostContextProvider policy 仍留 Host。
3. 搜索 `new ShortcutManager`、Capability/Runtime/Config/Feature constructors、`registerScriptCapabilities`、Marker wiring 与 `createClacklyCore`，区分 production source、Host-specific instance、validation registry 和 tests/fixtures。
4. 确认 `ScriptExecutor` 同一个 providers Map 同时服务 execute/readiness，没有第二套 production runtime provider registry。
5. 审计 lazy timing：Root/Host startup 不 probe/spawn/launch；显式 refresh 的 cache-miss probe 走 Promise/async child process，无 spawnSync/execSync/busy wait；不优化既有 10 秒上限。
6. 审计 Marker precedence/no-fallback、两个 hostContextProvider 的原失败语义、execute-time validation、startup sequence，以及 cache path/schema/fingerprint/failure recovery/writer 语义。
7. 用现有工具或最小静态脚本检查真实 production import cycle；无真实 cycle 时不改代码。
8. 复核现有 composition canary 是否验证架构意图；已合理则不改，不建新测试框架。
9. 更新 README/现有 architecture docs：composition、command/script/readiness 链路、Host/Core 责任、readiness 与 execute validation 的关系，以及普通 Python Feature 的真实新增路径。
10. 仅在发现可证明 regression 时做最小 production 修复并补针对测试；否则仅提交文档/必要审计测试或零 production diff。
11. 运行 `npm test`、`npm run build`、Trellis validation、composition canary 与 staged diff check；如实记录仓库无 lint/typecheck/CI。
12. 汇总 Stable Now、Intentionally Flexible、Future Trigger 与真实剩余风险，提交 Phase commit，archive task，记录 journal 后停止。

## Review Gates

- Command Engine import graph 中无 Host/runtime implementation。
- FeatureStatusManager source 中无 Python/runtime-specific dispatch。
- Shared registration 有一个 production source；合理 fixtures 保留。
- ScriptExecutor execute/readiness 使用同一 providers Map。
- createClacklyCore 与 Host startup 不触发 runtime probe/launcher。
- probe cache miss 使用异步 subprocess；cache path/schema/fingerprint/recovery 不变。
- Marker、hostContextProvider、InteractionManager 与 Host startup 边界无回归。
- 文档中的每条开发步骤均可在当前仓库找到对应证据。

## Future Notes Only

- 第二种 runtime 真正出现：再评估 Runtime Provider registration abstraction。
- 第三方 Feature Package 真正出现：再设计 package、permissions、versioning、signature 与 marketplace。
- 第二个 Host 的 cache 冲突造成可复现数据错误：再设计 cache ownership/locking。
- 第三方不可信代码确需执行：再设计 permissions/sandbox/isolation。

## Required Report

按 PRD 的 10 项格式汇报，并提供 Phase 3 commit、archive 与 journal hashes。完成后不得启动新的架构 Phase。
