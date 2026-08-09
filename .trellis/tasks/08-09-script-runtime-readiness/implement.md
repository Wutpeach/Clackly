# Implementation Plan — Phase 2

1. 用 Phase 0 research 更新实际 API、status mapping、错误类型、缓存和文件清单。
2. 先补充 Script Capability availability tests：ready、missing、initializing、probe error、unknown runtime。
3. 增加 native capability regression test，证明通用 FeatureStatus flow 不变。
4. 在 Script Capability/ScriptCapabilityProvider 以现有 executor runtime lookup 委托 readiness。
5. 在 Runtime Provider/PythonProvider 暴露或复用稳定 probe result；不让上层解析 Python-specific 字符串。
6. 在 FeatureStatusManager 现有通用路径中消费结果，不增加 runtime-specific 分支。
7. 验证重复 status reads 不重复昂贵 probe；仅在证据需要时添加最小 cache/refresh，并覆盖安装/配置、初始化、失败后的失效测试。
8. 运行新增 unit/integration tests、相关 regression、lint/typecheck/build。
9. 按指定八项汇报、提交 Phase commit 并停止。

## Review Gates

- 搜索并确认 FeatureStatusManager 无 `python`/runtime-specific 分支。
- 搜索并确认 Capability 未直接调用 child_process、Python executable 或 Host IPC。
- 确认 unknown runtime 和 probe rejection 均产生稳定 status，而非未处理异常。

## Rollback Point

若 readiness API 迫使 RuntimeManager 生命周期重构，停止并缩回到现有 probe 契约的最小 adapter，不扩大任务。
