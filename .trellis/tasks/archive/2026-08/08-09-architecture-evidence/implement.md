# Implementation Plan — Phase 0

1. 读取两个 Host entry point，建立 construction/registration inventory。
2. 追踪每个 inventory item 的 imports、constructor args、Host API dependency 和 consumers。
3. 绘制现状 composition 图与 duplication table，分类 Core/Bootstrap/Adapter。
4. 追踪 Script readiness 全链路，记录缺失方法、probe 契约、状态映射、错误模型与缓存失效点。
5. 从项目/CI 配置解析真实验证命令并运行基线。
6. 补充或更新最小 characterization test，覆盖本阶段识别出的关键 composition/readiness 契约，并单独运行。
7. 将证据整理到本任务 `research/`，据此提出 Phase 1/2 design/implement 与文件清单修订；保持为待用户批准的规划变更。
8. 按用户指定的八项输出汇报并停止，不启动 Phase 1。

## Validation Record

逐项记录 unit、integration、lint、typecheck、build 和其他 CI job 的命令、exit code、失败摘要与归因；禁止用无关修复改变基线。

## Review Gate

Phase 1 开始前，用户需明确批准 Phase 0 报告及由证据修订后的 Phase 1 计划。
