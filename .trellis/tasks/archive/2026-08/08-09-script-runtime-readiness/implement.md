# Implementation Plan — Phase 2

1. **Research gate（禁止产品改动）**：检查 ScriptCapabilityProvider、ScriptExecutor、PythonProvider、RuntimeManager、FeatureStatusManager、Runtime probe/cache/errors；回答 PRD 十项取证问题并提交实际 mapping table。Lead 审阅后才进入第 2 步。
2. 先补充 Script Capability availability tests：ready、missing、unavailable、initializing、probe error、unknown runtime。
3. 增加 cache/latency tests：重复 FeatureStatus 查询不重复昂贵 probe；复用现有 invalidation，不永久缓存 failure。
4. 增加 Marker/native、provider precedence、execute result/error、两个 Host shared wiring、startup/lazy timing regression。
5. 在 Script Capability/ScriptCapabilityProvider 以现有 executor runtime lookup 委托 readiness；不建立第二套 provider source。
6. 在 Runtime Provider/PythonProvider 暴露或复用稳定 application-level availability；不让上层解析 Python/process/fs 字符串。
7. 仅在现有契约确有缺口时为 RuntimeManager 增加最小 probe 委托；不改变 execute-time validation、lifecycle、cache path/schema/writer。
8. 在 FeatureStatusManager 现有通用路径中消费结果，不增加 Python/runtime-specific 分支或新 enum。
9. 搜索并确认禁止依赖；运行定向 tests、完整 `npm test`、`npm run build`、Trellis validation。仓库无 lint/typecheck/CI，不新增。
10. 提交 Phase commit，按九项报告并停止，不启动 Phase 3。

## Phase 2 完成记录（2026-08-09）

- **新增 API**（沿现有执行关系，无反向依赖）：`capability/script.js` `checkAvailability()`；`ScriptCapabilityProvider.checkAvailability(definition, {capabilityId})`；`ScriptExecutor.checkAvailability()`（同一 `this.providers` Map；未知 runtime → `Unsupported script runtime: X`，provider 无 readiness → `Runtime availability is unavailable: X`，均稳定 `unavailable` 不 throw，execute 不受影响）；`PythonProvider.checkAvailability()`（仅 provider 受控 entry 错误——带内部 code `PYTHON_ENTRY_INVALID`——映射为 `missing-dependency [script-entry]`；意外 fs/realpath/stat 错误 rethrow；其余按 Approved mapping 归一化，未映射错误 rethrow）；`RuntimeManager.checkAvailability({runtime, capabilityId})`（复用抽出的 `resolveAndProbe` helper：override→host→resolver→probe，不触碰 launcher/desktop）。
- **fail-fast 契约**：createScriptCapability/ScriptCapabilityProvider/PythonProvider 构造同时要求 execute+checkAvailability；PythonProvider 新增可选 `fileSystem` 注入（默认 node:fs，最小测试 seam，与 RuntimeFingerprint/Resolver 模式一致）。
- **execute 不变**：完整 request/entry/config/command 校验保留，错误顺序、code、调用次数、lazy timing 不变；`resolveAndProbe` 与原 ①—⑤ 逐行等价。
- **不变**：FeatureStatusManager（零改动，无 python/runtime 分支）、registerScripts、createClacklyCore、两个 Host、probe/cache schema/path/writer、startup/lazy timing、marker precedence、unknown-runtime execute throw 语义。
- **mapping**（PythonProvider 归一化）：RUNTIME_NOT_FOUND→missing-dependency[python-runtime]；RESOLVE_MODULE/LIBRARY_NOT_FOUND→missing-dependency[resolve-scripting]；RUNTIME_UNSUPPORTED/ARCHITECTURE_UNSUPPORTED/VERSION_MISMATCH/RESOLVE_NOT_RUNNING→unavailable；override invalid/host unverified/probe/launcher 失败→rethrow（manager 记 error）。loading/missing-config 仍由 FeatureStatusManager lifecycle 派生。
- **测试**：全量 237/237 通过；新增 14 项（含真实 RuntimeProbe+共享缓存：重复 check 只 spawn 一次、失败清缓存后恢复）。

## Review Gates

- 搜索并确认 FeatureStatusManager 无 `python`/runtime-specific 分支。
- 搜索并确认 Capability 未直接调用 child_process、Python executable 或 Host IPC。
- 确认 unknown runtime 和 probe rejection 均产生稳定 status，而非未处理异常。
- 确认 UI/Core 上层不解析 executable/process/fs 错误，provider source-of-truth 只有一份。
- 确认 createClacklyCore public API、Host startup、runtime/cache lifecycle 与共享 path/schema 未变化。

## Rollback Point

若 readiness API 迫使 RuntimeManager 生命周期重构、cache schema 修改或 Root public API 扩大，停止并汇报；不得自行设计 registry/framework 或 eager initialization。
