# Design — Script Runtime Readiness

## Boundary

Availability 沿现有执行关系反向查询，但不建立反向模块依赖：FeatureStatusManager 只调用 Capability 契约；Script Capability 将请求委托给其现有 provider/executor；Runtime Provider 复用 RuntimeManager probe。

```text
FeatureStatusManager
  → capability.checkAvailability()
  → script capability/provider
  → existing runtime provider lookup
  → provider.checkAvailability() or existing equivalent
  → RuntimeManager and/or existing probe collaborator/cache/state
  → stable availability result
```

最终方法名和返回结构由 Phase 0 记录的现有 API 决定。只有缺少最小委托点时才新增 API，不要求 RuntimeManager 暴露新的公共 `probe()`。

## Status Mapping Contract

| Runtime evidence | Feature status intent |
| --- | --- |
| 可执行且已就绪 | `ready` |
| 正在初始化 | `loading` |
| 配置项缺失 | `missing-config`（仅在现有模型确有此语义时） |
| runtime dependency/可执行文件缺失 | `missing-dependency` |
| 当前 Host/runtime 不支持 | `unavailable` |
| probe 意外失败 | `error` |

Phase 0 必须把此意图表替换/补充为实际字段、reason/details 和错误类别，并标明 probe contract 与 manager lifecycle state 的分工。

## Error Ownership

- RuntimeManager/Provider 持有具体 executable/probe failure 知识。
- Script layer 只转发或包装现有稳定 availability，不解析散落字符串。
- FeatureStatusManager 保持通用映射，不按 runtime 名称分支。

## Performance

优先读取现有 probe cache/runtime state/initialization state。若必须缓存，缓存放在已负责 runtime state 的最低合适层，采用最小失效机制，不增加 timer 或 polling。

## Compatibility and Rollback

执行 protocol、command manifests、native capability 和 UI contract 不变。Phase commit 可独立回滚到执行时才发现 runtime error 的旧行为。
