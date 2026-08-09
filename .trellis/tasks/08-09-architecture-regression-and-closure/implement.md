# Implementation Plan — Phase 3

1. 对照 Phase 0 composition 和 Phase 1/2 commits 建立最终 dependency map。
2. 搜索 Command Engine、Capability、Runtime Provider、FeatureStatusManager 的禁止依赖和 runtime-specific 分支。
3. 搜索指定 constructor/registration 关键字，区分 production Host duplication 与测试 fixture。
4. 使用项目现有工具或 import graph 检查三类循环依赖；发现问题只做最小调整并补测试。
5. 更新架构文档/README 的责任分层、调用链和普通 Python Feature 开发路径。
6. 运行完整 unit、integration、lint、typecheck、build 和所有相关 CI job。
7. 汇总 Stable now、Still intentionally flexible、Future trigger；明确未来触发条件而不实现。
8. 提交 Phase commit，给出最终架构评估和测试结果，停止本轮架构优化。

## Review Gates

- Command Engine import graph 中无 Host/runtime implementation。
- FeatureStatusManager source 中无 Python/runtime-specific dispatch。
- Shared registration 有一个 production source；合理 fixtures 保留。
- 文档中的每条开发步骤均可在当前仓库找到对应证据。

## Future Notes Only

- 第二种 runtime 真正出现：再评估 Runtime Provider registration abstraction。
- 第三方 Feature Package 真正出现：再设计 package、permissions、versioning、signature 与 marketplace。
