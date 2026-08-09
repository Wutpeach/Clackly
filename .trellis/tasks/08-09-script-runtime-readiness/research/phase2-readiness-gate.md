# Phase 2 — Readiness Research Gate（只读取证，2026-08-09）

> 依据：08-09-script-runtime-readiness/prd.md、design.md、implement.md 第 1 步；Phase 0 archive research（02-readiness.md）；Phase 1 封板的 Composition Root。
> 本轮未修改任何 production/test 代码；未运行任何会启动真实 Python/Resolve 的命令（仅读取源码与既有 unit tests）。

## 1. 十项取证回答

| # | 问题 | 现状（证据） |
|---|---|---|
| 1 | provider 是否已有 readiness API | **无**。ScriptCapabilityProvider 只有 execute（ScriptCapabilityProvider.js:9-40）；PythonProvider 只有 execute（providers/PythonProvider.js:38-83） |
| 2 | executor 是否暴露 provider lookup | **无**。ScriptExecutor 持有私有 `this.providers` Map，仅 execute 内部 `this.providers.get(definition.runtime)`（ScriptExecutor.js:6-20）；无其他方法 |
| 3 | PythonProvider 执行前如何获取 runtime | **不获取**。唯一预检是 `resolveEntry`（fs.realpathSync/statSync 路径校验，providers/PythonProvider.js:23-36）；runtime 解析全部委托 `runtimeManager.execute`（内部 resolver→hostContextProvider→probe→launcher） |
| 4 | RuntimeManager probe/cache | 构造时内部 `new RuntimeProbe({launcher, cachePath, platform, architecture})`（manager.js:54-56）；execute 每次调用 `this.probe.probe(...)`（manager.js:131-145）；缓存 = RuntimeProbeCache schemaVersion 1，`%APPDATA%/Clackly/runtime-probe.json`（probe.js:199-257） |
| 5 | cache key / lifecycle / invalidation | key = fingerprint：clacklyVersion + runtime{id,version,executableMtimeMs} + resolveVersion + bridge{modulePath,libraryPath,mtimeMs} + platform/arch + overridePath（probe.js:111-149）；lifecycle：load→lookup（hit/stale/miss/forced，probe.js:227-237）→命中直接返回不 spawn；**仅保存 passed 结果**（save 校验 validCachedResult，probe.js:239-244）；**失败 clear 缓存**（probe.js:443-452）；schema-invalid/read-failed → miss（probe.js:209-225） |
| 6 | probe 是否启动 runtime | **是**。resolve-probe 经 RuntimeLauncher spawn Python 子进程（`-I -u -X faulthandler bootstrap.py`，launcher.js:363），bootstrap.resolve_probe 导入 DaVinciResolveScript、`scriptapp("Resolve")`、读版本（bootstrap.py:71-204） |
| 7 | 是否 spawn subprocess | **是**（probe 与 script-execute 都 spawn；二者共用 launcher）。availability 首次 cache miss 时必然 spawn |
| 8 | FeatureStatusManager 期望的 checkAvailability 返回结构 | `{status: "ready"|"missing-dependency"|"unavailable", message: string|null, details: {missing: string[], action: "open-settings"|null}}`；normalizeProbeResult 严格校验：missing-dependency 必须有 missing ids、unavailable/ready 禁止 missing/action、message 必须 string|null；**throw → error 记录**（FeatureStatusManager.js:16-55, 139-161） |
| 9 | 稳定 reason/details 模型 | 三层现有错误词汇：RuntimeError{code, supportStatus, details}（runtime/errors.js）；probe error{code, message, stage, details}（probe.js:348-371）；bootstrap error{code, type, message, details}（bootstrap.py:14-27）。归一化职责在 Runtime Provider（PythonProvider）层：code→稳定 status/message，不散落 process/fs 字符串 |
| 10 | unknown runtime execute 当前错误 | `throw new Error("Unsupported script runtime: lua")`——plain Error，无 code（ScriptExecutor.js:16；测试 ScriptExecutor.test.js:13-14） |

## 2. 修改前真实 readiness/execute 链（最小断点）

```text
FeatureStatusManager.refreshOne(featureId)                    [feature-status/FeatureStatusManager.js]
  ├─ configManager.getMissingRequired → missing-config        （manager lifecycle 派生）
  ├─ capability.checkAvailability? ── ✗ 断点 ── script capability 无此方法
  │     （createScriptCapability 只返回 {metadata, execute}，capability/script.js:9-19）
  │     → FeatureStatusManager 直接判 "ready"（FeatureStatusManager.js:132-137）
  └─ 有 probe 的 native capability（marker.add）走正常 probe 契约

【execute 时才触发的 readiness 全链（当前唯一会碰 runtime 的路径）】
CommandExecutor → capability.execute → ScriptCapabilityProvider.execute
  → ScriptExecutor.execute（按 definition.runtime 查私有 Map）
  → PythonProvider.execute（resolveEntry 预检）→ RuntimeManager.execute
      ① 请求校验（RUNTIME_REQUEST_INVALID）
      ② override → RuntimeResolver.resolve（RUNTIME_OVERRIDE_INVALID / RUNTIME_NOT_FOUND / RUNTIME_UNSUPPORTED）
      ③ hostContextProvider()（失败 → RESOLVE_VERSION_UNVERIFIED）
      ④ resolver.resolve（manifest profile 匹配）
      ⑤ this.probe.probe(...)（spawn；cache hit 则跳过 spawn）
      ⑥ launcher.execute（script-execute；RUNTIME_* 进程错误）
      ⑦ desktop plan 处理（AFTER_EFFECTS_LAUNCH_*）

最小断点：capability.checkAvailability 缺失；ScriptCapabilityProvider/ScriptExecutor/PythonProvider
无 availability 委托；RuntimeManager 无 probe 委托（probe 私存在于 execute 内部）。
```

## 3. 实现前 mapping table（runtime evidence → provider availability → Feature Status）

**分层原则**：`loading`、`missing-config` 由 FeatureStatusManager lifecycle 派生（refresh 置 loadingRecord；getMissingRequired 非空 → missing-config），**不由 probe 返回**。probe 只可能产出 `ready` / `missing-dependency` / `unavailable` /（抛错→manager 记 `error`）。不新增任何 enum。

| runtime evidence（code / supportStatus） | 来源层 | provider availability（PythonProvider 归一化后） | FeatureStatus status | message（稳定） | details.missing / action |
|---|---|---|---|---|---|
| probe passed + machine-verified（effectiveStatus ready） | RuntimeProbe | `{status:"ready", message:null}` | ready | null | `[] / null` |
| probe passed + overridden（CUSTOM_RUNTIME_UNVERIFIED warning） | RuntimeProbe | `{status:"ready", message:null}`（warning 留在 runtime 层诊断，不进入 FeatureStatus） | ready | null | `[] / null` |
| `RUNTIME_NOT_FOUND`（supportStatus=missing-runtime；manifest 或 override 可执行文件缺失） | RuntimeResolver | `{status:"missing-dependency", missing:["python-runtime"]}` | missing-dependency | "Python runtime executable is missing" | `["python-runtime"] / null` |
| `RESOLVE_MODULE_NOT_FOUND` / `RESOLVE_LIBRARY_NOT_FOUND`（bootstrap） | bootstrap（经 probe.mapFailure 归一化） | `{status:"missing-dependency", missing:["resolve-scripting"]}` | missing-dependency | "DaVinci Resolve scripting module or library is missing" | `["resolve-scripting"] / null` |
| PythonProvider.resolveEntry 失败（entry 非文件/逃逸） | PythonProvider | `{status:"missing-dependency", missing:["script-entry"]}` | missing-dependency | "Script entry is not available" | `["script-entry"] / null` |
| `RUNTIME_UNSUPPORTED`（supportStatus=unsupported，无匹配 profile） | RuntimeResolver | `{status:"unavailable"}` | unavailable | "No compatible managed Python runtime for this Resolve version" | `[] / null` |
| `RUNTIME_ARCHITECTURE_UNSUPPORTED` / `RUNTIME_VERSION_MISMATCH` | bootstrap | `{status:"unavailable"}` | unavailable | 对应稳定文案 | `[] / null` |
| `RESOLVE_NOT_RUNNING`（Resolve 未运行/scripting 不可用） | bootstrap | `{status:"unavailable"}` | unavailable | "DaVinci Resolve is not running or scripting is unavailable" | `[] / null` |
| unknown runtime（不在 executor provider map） | ScriptExecutor | `{status:"unavailable"}` | unavailable | `Unsupported script runtime: ${runtime}` | `[] / null` |
| `RUNTIME_OVERRIDE_INVALID`（非路径形式） | RuntimeResolver | `{status:"error"}` | error（manager 兜底） | "Custom Python runtime override is invalid" | `[] / null` |
| `RESOLVE_VERSION_UNVERIFIED`（hostContextProvider 抛错/非法 host） | RuntimeManager | `{status:"error"}` | error | "DaVinci Resolve version could not be verified"（cause 保留在 details） | `[] / null` |
| launcher 级失败：RUNTIME_SPAWN_FAILED / RUNTIME_PROCESS_EXITED / RUNTIME_TIMEOUT / RUNTIME_NATIVE_BRIDGE_CRASH / RUNTIME_PROTOCOL_INVALID / RUNTIME_PROTOCOL_EMPTY / RUNTIME_OUTPUT_LIMIT / RUNTIME_STDIN_FAILED / RUNTIME_TEMP_CLEANUP_FAILED / RUNTIME_BOOTSTRAP_FAILED(未映射 code) | RuntimeLauncher / mapFailure | `{status:"error"}` | error | 稳定文案（原始 code 保留在 details） | `[] / null` |
| `RESOLVE_CONNECTION_FAILED` / `RESOLVE_IMPORT_FAILED` / bootstrap `RESOLVE_VERSION_UNVERIFIED` / 未知 code | bootstrap / 兜底 | `{status:"error"}` | error | "Python runtime probe failed"（code 保留） | `[] / null` |
| loading / missing-config | FeatureStatusManager lifecycle | —（不来自 probe） | loading / missing-config | 现有文案 | 现有语义 |

**manager 兜底**：provider availability 若意外 throw（如 normalize 未覆盖），FeatureStatusManager 现有 catch 记 `error`（FeatureStatusManager.js:151-161）——与 native capability 相同，无需改动。

## 4. 最小 API 提案（逐层；复用同一 provider map/source-of-truth）

| 层 | 变化 | 提案 |
|---|---|---|
| `capability/script.js` | **改（最小）** | capability 增加 `checkAvailability()` → `scriptCapabilityProvider.checkAvailability(metadata.executor, { capabilityId: metadata.id })`。execute/metadata 不变 |
| `script-runtime/ScriptCapabilityProvider.js` | **改（最小）** | 增加 `checkAvailability(scriptDefinition, {capabilityId})`：校验 capabilityId（镜像 execute 的入参校验，不需要 command/config）→ `this.scriptExecutor.checkAvailability(...)` |
| `script-runtime/ScriptExecutor.js` | **改（最小）** | 增加 `checkAvailability(definition, context)` 镜像 execute：校验 `definition.runtime` 非空；查同一 `this.providers` Map；provider 缺失或 provider 无 `checkAvailability` → 稳定 `{status:"unavailable", message:"Unsupported script runtime: X"}`（不 throw）；否则委托 provider。execute 及 unknown-runtime throw 语义**不变** |
| `script-runtime/providers/PythonProvider.js` | **改（最小）** | 增加 `checkAvailability(definition, {capabilityId})`：① resolveEntry（复用现有，失败→missing-dependency）② `runtimeManager.checkAvailability({runtime:"python", capabilityId})` ③ RuntimeError/probe error → 按 §3 表归一化。execute 不变 |
| `script-runtime/runtime/manager.js` | **改（最小）** | 增加 `async checkAvailability({runtime, capabilityId})`：复用 execute 的 ①—⑤（请求校验→override/resolver→hostContextProvider→probe），**不含 launcher/desktop**；probe 失败按 execute 同款转换抛 RuntimeError（RUNTIME_PROBE_FAILED + supportStatus + details.probe）；成功返回 probe result 对象（现成 {ok, supportStatus, probeStatus, effectiveStatus, warnings, runtime, resolve, bridge, cache, error?} 形状）。execute/constructor/lifecycle/cache **不变**；不新增公开 `probe()` 名 |
| `feature-status/FeatureStatusManager.js` | **不变** | 通用路径已消费该契约（checkAvailability + normalizeProbeResult + throw→error） |
| `capability/registerScripts.js` | **不变** | 默认 wiring 已把 PythonProvider 注入 executor 的同一 Map |
| `app/createClacklyCore.js` | **不变** | Root public API 不变；runtimeManager 已返回（script service 观察点）且 registerScriptCapabilities 已注入 |
| `workflow-plugin/main.js` / `electron/main/main.js` | **不变** | 零改动 |

**fixture 影响（实现阶段处理）**：`capability/loader.test.js` 的 stub `{execute()}` provider 需补 `checkAvailability`（或不走真实 executor）——属"保留测试 fixture 合理独立构造"范围内的既有测试更新，非产品改动。

## 5. Probe/cache 行为与不变量

- **首次 check**（cache miss/stale）：走完整 resolve-probe（**spawn 一次**，10s 超时上限，launcher.js:76）；passed → 写入共享缓存；failed → 清空缓存。
- **重复 check**：fingerprint 命中 → 直接返回缓存结果，**不 spawn**（probe.js:125-143 测试 "a hit does not spawn" 已固化）。Settings 高频读取走 FeatureStatusManager 内存缓存（list() 不触发 checkAvailability，仅显式 refresh 触发）。
- **install/resolve change**：fingerprint 任一字段变化（新 python、新 Resolve 版本、bridge 文件 mtime、clacklyVersion、overridePath）→ stale → 重探。
- **failure 后**：probe 失败清缓存 → 下一次显式 refresh 重探（"失败不得永久 stale"满足；重探以显式 refresh 为限，无 timer/poller）。
- **spawn 边界**：resolver 已证明 executable 缺失（RUNTIME_NOT_FOUND）或 profile 不匹配（RUNTIME_UNSUPPORTED）时**不 spawn**；仅 resolution 成功后 cache miss 才 spawn。
- **lazy startup 不变**：createClacklyCore/startup 不调用 checkAvailability；hostContextProvider 在 availability 与 execute 中同样保持"调用时才执行"。
- **共享 path/schema/writer 不变**：同一 `%APPDATA%/Clackly/runtime-probe.json`、schemaVersion 1、同一 RuntimeProbe 实例（manager 构造时创建）→ writer 数量不变；无新 cache/locking/namespace/daemon。

## 6. 阻塞条件检查（结论：无阻塞）

| 条件 | 结论 |
|---|---|
| availability 与 runtime initialization/start 是否可区分 | **可区分**。availability 停在 execute 的 ⑤（probe）；不执行 ⑥ launcher（script-execute）与 ⑦ desktop plan；不引入任何新的 "start" 概念。probe 本身是既有 execute 路径第一步验证，语义不变 |
| 是否必须改 cache schema | **否**。完整复用 RuntimeProbeCache（schemaVersion 1 / fingerprint / save-passed / clear-on-failure） |
| 是否必须扩大 Root public API | **否**。readiness 在 Root 已创建的同一 script/runtime chain 内生效；runtimeManager 已存在并已注入 registerScriptCapabilities |
| 是否必须改 FeatureStatusManager / 新增第二套 registry/cache | **否**（§4 不变列） |

## 7. 剩余风险（真实）

1. **首次 refresh 会 spawn**（cache miss）：Settings 首次打开时最长可能阻塞至 probe 完成/超时（10s）。缓解：probe 是既有机制；用户显式 refresh 触发，非 render 高频路径。
2. **resolve-probe 需要 Resolve 运行中**（bootstrap `scriptapp("Resolve")`，bootstrap.py:163-178）：Workflow Host 内 Resolve 必然在跑（插件由 Resolve 启动）；standalone 需先起 bridge+Resolve。Resolve 未运行 → RESOLVE_NOT_RUNNING → unavailable（稳定，非 error）。
3. **last-writer-wins 保持**：availability 与 execute 共享同一缓存文件，两 Host 并发写为既有语义（ConfigManager.js:33 注释），不变。
4. **overridden 运行时**：自定义 python 通过 probe 后仍显示 ready（warning 留在 runtime 层），与 execute 语义一致。
5. **execution 的 TOCTOU**：readiness 只是预判，execute 仍完整走 ①—⑦（PRD 明确接受）。
6. **stub fixture 需要补 checkAvailability**（loader.test.js）——实现阶段随测试更新，非产品改动。
