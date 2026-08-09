# Design — Phase 0 取证方法

## Evidence Sources

1. 从两个 Host entry point 向下追踪 import、构造和 registration。
2. 以实例的构造参数和被调用位置判断 ownership，不以文件夹名称猜测。
3. 从 FeatureStatusManager 的入口向 runtime probe 双向追踪，并记录每层实际输入/输出。
4. 从 `package.json`、workspace scripts 和 CI 配置建立测试命令矩阵。

## Classification Rules

- **Application Core Composition**：两个 Host 都必须以相同规则创建/连接的 application service 或共享 registration。
- **Host Bootstrap**：进程/窗口/IPC/lifecycle 以及 Host 入口协调。
- **Host-specific Adapter**：直接依赖 Electron、Resolve Workflow Integration、native bridge 或宿主 global。
- **Uncertain**：只有运行时或测试证据才能确认时，明确列为风险，不提前抽象。

## Deliverable Shape

- 一张主链路 composition 图。
- 一张组件对照表，附参数差异与分类理由。
- 一张 readiness 调用链/状态映射表，标出断点。
- 一张测试基线表。

Phase 0 不选择最终 Composition Root API；它只为后续子任务提供约束证据。

## Rollback

产品代码无架构改动。新增/更新的 characterization test 必须只固化现状，可独立回滚且不影响 runtime 行为。
