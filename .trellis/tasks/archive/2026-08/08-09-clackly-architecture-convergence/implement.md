# Implementation Plan — Clackly 架构收口优化

## Stage Gates

- 仅启动下一个获批子任务，不启动父任务。
- 每个 Phase：执行工作 → 更新/补充测试 → 运行该阶段验证 → 完成本阶段获授权的 commit/收尾 → 按该 Phase 模板一次性汇报 → 停止。
- Phase 1/2 的汇报必须在 commit 后生成，以便包含真实 commit hash；Phase 0 不额外扩大用户指定的八项汇报。
- 后续 Phase 不得因前一 Phase 完成而自动开始。

## Ordered Children

1. Phase 0：完成架构取证、最小 characterization tests 与测试基线；提出 Phase 1/2 设计和文件清单修订，等待用户批准后才视为后续计划。
2. Phase 1：抽离共享 Application Composition Root；验证两个 Host 与既有 capabilities 的回归。
3. Phase 2：接通 Script Capability → Runtime readiness；覆盖五类 runtime 状态与 native capability 回归。
4. Phase 3：做依赖/去重/循环依赖/文档/完整 CI 回归并给出最终封板判断。

## Cross-Task Validation

- 使用仓库 `package.json` / CI 配置确认真实的 unit、integration、lint、typecheck、build 命令。
- 不把 Phase 0 发现的历史无关失败扩展成额外重构；记录命令、失败与是否由本任务引入。
- Phase 3 运行所有存在的 CI job，并确认工作树只含本任务范围内改动。

## Review and Rollback Points

- Phase 0 报告是 Phase 1/2 设计的证据 gate。
- Phase 1 commit 是 composition 变更的独立回滚点。
- Phase 2 commit 是 readiness 变更的独立回滚点。
- Phase 3 只允许最小修正；未来扩展机会写入 notes，不实施。
