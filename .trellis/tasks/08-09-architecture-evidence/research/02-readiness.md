# 02 — Script Runtime Readiness 链路取证（Phase 0）

## 1. 真实调用链现状

```text
FeatureStatusManager.refreshOne()                       feature-status/FeatureStatusManager.js:112-162
  ├─ configManager.getMissingRequired(featureId)        → 非空 → "missing-config" + action: open-settings
  ├─ capability.checkAvailability()                     → 不存在该方法的 capability 直接判 "ready"
  │     marker.add: ✅ 有 (capability/marker.js:55-69)
  │     script capabilities (createScriptCapability): ❌ 无 —— 关键断点
  └─ 通过 normalizeProbeResult() 校验后映射 status

【执行时才触发的 readiness 链路】（当前唯一会碰 runtime 的路径）
CommandExecutor.execute (command-engine/executor.js:22-38)
  → capability.execute(command, { config })
  → ScriptCapabilityProvider.execute (script-runtime/ScriptCapabilityProvider.js:18-40)
  → ScriptExecutor.execute (script-runtime/ScriptExecutor.js:6-20)   [按 definition.runtime 查 provider map]
  → PythonProvider.execute (script-runtime/providers/PythonProvider.js:38-83)
  → RuntimeManager.execute (script-runtime/runtime/manager.js:81-213)
      1. 校验 request (RUNTIME_REQUEST_INVALID)
      2. override 处理 → RuntimeResolver.resolve (RUNTIME_OVERRIDE_INVALID / RUNTIME_NOT_FOUND / RUNTIME_UNSUPPORTED)
      3. hostContextProvider() → RESOLVE_VERSION_UNVERIFIED
      4. resolver.resolve(...)  (manifest profile 匹配)
      5. probe.probe({ resolution, clacklyVersion, resolveVersion, bootstrapPath })  ← readiness 在这里
      6. launcher.execute(...)  (RUNTIME_* 各种进程错误 / RUNTIME_PROTOCOL_INVALID / RUNTIME_BOOTSTRAP_FAILED)
      7. desktopLaunch plan 处理 (AFTER_EFFECTS_LAUNCH_*)
  → 返回 { ok, result, logs } script envelope
```

## 2. 断点确认

| 环节 | 现状 | 证据 |
|---|---|---|
| Script Capability 的 `checkAvailability` | **不存在**。`createScriptCapability` 只返回 `{metadata, execute}` | capability/script.js:9-19 |
| FeatureStatusManager 对无 probe 的 capability | 直接 `"ready"`（"configured capabilities default ready without a probe"） | FeatureStatusManager.js:132-137；测试 feature-status/FeatureStatusManager.test.js:84-85 |
| ScriptCapabilityProvider 的 availability | 无（只有 execute） | ScriptCapabilityProvider.js:9-40 |
| ScriptExecutor 的 availability | 无（只有按 runtime 查 map 的 execute） | ScriptExecutor.js:6-20 |
| PythonProvider 的 probe/readiness | **无**。只有 execute（resolveEntry 做路径存在性检查是唯一预检） | PythonProvider.js:23-36, 38-83 |
| RuntimeManager 的 probe | 无独立公开 `probe()` 方法；readiness 由内部 `this.probe.probe()` 在每次 execute 时执行 | manager.js:131-145 |
| RuntimeProbe（底层 collaborator） | **有完整的 probe + 缓存**：`{ok, supportStatus, probeStatus, effectiveStatus, warnings, runtime, resolve, bridge, cache, error?}` | probe.js:382-454 |

## 3. Probe 返回结构与状态映射（现成可复用）

`RuntimeProbe.probe()` 成功/失败均返回对象（不抛错）：
```js
{
  ok: bool,                       // probeStatus === "passed"
  supportStatus: "machine-verified" | "overridden" | "unsupported" | "missing-runtime",
  probeStatus: "not-run" | "passed" | "failed" | "stale",
  effectiveStatus: "ready" | "warning" | "blocked",   // RuntimeDiagnostics.derive (probe.js:88-101)
  warnings: [{ code, message }],  // 仅 overridden+passed → CUSTOM_RUNTIME_UNVERIFIED
  runtime: { id, version, architecture, executable },
  resolve: { version, connected },   // 失败时 connected: false
  bridge: { modulePath, libraryPath },
  cache: { status: "hit"|"miss"|"stale"|"forced"|"write-failed"|"clear-failed"|"cleared", reason?, diagnostic? },
  error?: { code, message, stage, details }   // 仅失败时 (mapFailure, probe.js:348-371)
}
```

`RuntimeManager.execute` 在 `!readiness.ok` 时把上述结构转成 **RuntimeError** 抛出：
```js
new RuntimeError(readiness.error.code || "RUNTIME_PROBE_FAILED", readiness.error.message,
  { supportStatus: readiness.supportStatus, details: { probe: readiness } })
```
（manager.js:139-145）—— probe 原始对象被塞进 `details.probe`，可被上层消费。

## 4. 错误类型（可复用）

`RuntimeError`（script-runtime/runtime/errors.js）：`{ code, message, supportStatus?, details }`。

| code | 触发点 | supportStatus |
|---|---|---|
| RUNTIME_REQUEST_INVALID | manager/resolver/probe 入参校验 | — |
| RUNTIME_OVERRIDE_INVALID | override 路径非法 | — |
| RUNTIME_NOT_FOUND | manifest executable / override 可执行文件缺失 | `missing-runtime` |
| RUNTIME_UNSUPPORTED | 无匹配 profile | `unsupported` |
| RESOLVE_VERSION_UNVERIFIED | host 版本读不到/不合法 | — |
| RUNTIME_PROBE_FAILED（或 probe 内层 code） | probe 失败（内层：RUNTIME_BOOTSTRAP_FAILED→bootstrap.code、RUNTIME_NATIVE_CRASH→RUNTIME_NATIVE_BRIDGE_CRASH、RUNTIME_TIMEOUT→stage runtime-timeout 等） | 透传 resolution.supportStatus |
| RUNTIME_PROTOCOL_INVALID | 子进程 envelope 非法 | — |
| RUNTIME_SPAWN_FAILED / RUNTIME_PROCESS_EXITED / RUNTIME_STDIN_FAILED / RUNTIME_OUTPUT_LIMIT / RUNTIME_TEMP_CLEANUP_FAILED | launcher 进程层 | — |
| RUNTIME_MANIFEST_INVALID | manifest 读取/校验失败 | — |
| AFTER_EFFECTS_LAUNCH_INVALID / _FAILED | desktop launch plan | — |

另有 launcher 层 bootstrap 失败：`RUNTIME_BOOTSTRAP_FAILED`（launcher.js:296-299）携带 `bootstrapError`（Python 侧上报的 `{code,type,message,details}`），probe.mapFailure 会归一化。

## 5. 缓存/初始化状态现状

| 缓存 | 位置 | 行为 |
|---|---|---|
| RuntimeProbeCache（schemaVersion 1，`%APPDATA%/Clackly/runtime-probe.json`） | probe.js:199-257 | 仅保存 **passed** 结果；fingerprint（clacklyVersion+runtime+resolveVersion+bridge 文件 mtime+platform/arch）命中 → `cache.status: "hit"` 不 spawn 子进程；任何指纹变化 → stale 重探；失败 → **clear 缓存** |
| RuntimeManager 内部 probe 实例 | manager.js:54-56 | 每次 execute 复用同一 probe（缓存天然生效）；无独立 readiness getter，无初始化状态对象 |
| FeatureStatusManager 内存 Map | FeatureStatusManager.js:73 | 每 feature 一条 record，`get()` 惰性初始化为 "loading"；refresh 才真正 probe；**无跨进程共享** |

## 6. Feature Status 状态映射（六态全貌）

FeatureStatusManager 产出 `{id, installed, enabled, status, message, details:{missing, action}}`：

| status | 来源 | 示例 message | action |
|---|---|---|---|
| loading | lifecycle（首次 get / refresh 置位） | "Checking feature availability…" | null |
| missing-config | configManager.getMissingRequired 非空 | "Missing After Effects Path" | open-settings |
| ready | capability 无 checkAvailability（脚本能力全部如此）；或 probe 返回 ready | null | null |
| missing-dependency | probe 返回（必须带 missing ids） | "Missing xxx" | 仅 probe 提供时 |
| unavailable | probe 返回（禁止 action） | "Feature is unavailable." | null |
| error | probe 抛错/返回非法结构/存储读取失败 | "Unable to determine feature status." | null |

**断点结论**：六个 status 在 FeatureStatusManager 层**已完整存在**；缺口在 capability 层——script capability 没有 checkAvailability，因此脚本 feature 在 Settings 里永远是 ready，只有真正执行命令时才可能暴露 RUNTIME_* 错误。Phase 2 需要的最小委托点是：ScriptCapabilityProvider/ScriptExecutor 提供基于现有 runtime provider map 的 availability 查询，并复用 `RuntimeProbe` 的返回结构 + `RuntimeError`，而不是新建另一套 status enum。

## 7. 现成可复用点

- `RuntimeDiagnostics.derive` 的 ready/warning/blocked 语义（probe.js:88-101）与 FeatureStatusManager 的 ready/missing-dependency/unavailable 的映射工作可正交：前者描述 runtime 自身状态，后者描述 feature 消费视角。
- `RuntimeProbeCache` 天然防高频 spawn：重复 status 读取只要指纹不变就走 cache hit（probe.js:125-143, 227-237）。
- probe 失败路径带 `details.probe` 完整上下文（manager.js:139-145），Phase 2 可直接转发为 reason/details。
