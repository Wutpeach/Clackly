# 01 — Host Composition 取证（Phase 0）

事实来源：`resolve-command-center/workflow-plugin/main.js`、`electron/main/main.js` 及其直接 require 的模块。所有结论均以代码为准；文件夹名不参与判断。

## 1. 当前 composition 图

两个 Host 都是 Electron main process（`workflow-plugin/main.js` 也 require `electron` 并持有自己的 `app`）。

```text
             ┌────────────────────────────────────────────────┐
             │    Shared Application Services (Core)          │
             │  (两 Host 逐字重复的构造/注册代码块，           │
             │   不依赖 Electron API)                         │
             │  ShortcutManager → marker keyboard backend     │
             │  createCapabilityRegistry → register marker.add│
             │  registerScriptCapabilities(registry, appRoot, │
             │      runtimeManager)                           │
             │  AfterEffectsLauncher                          │
             │  RuntimeManager(...)                           │
             │  FeatureCatalog(registry)                      │
             │  ConfigManager(registry, storage)              │
             │  FeatureStatusManager(registry, config, state) │
             │  createCommandExecutor(...)                    │
             │  InteractionManager(storage, executeCommand)   │
             └───────┬──────────────────────┬────────────────┘
                     │                      │
┌────────────────────┴─────────┐  ┌─────────┴─────────────────────┐
│ Shared Host Bootstrap        │  │ (Host-specific 部分，见下)    │
│ (两 Host 逐字重复，但直接依赖 │  │                             │
│  Electron API，归 Host 不归   │  │                             │
│  Core)                       │  │                             │
│  composeStartup(...)         │  │                             │
│  window.js / hotkey.js       │  │                             │
│  registerFeatureUiIpc(...)   │  │                             │
│   (消费 ipcMain/dialog)      │  │                             │
│  IPC handler invocation      │  │                             │
│   (commands:*/interactions:  │  │                             │
│    */palette:hide)           │  │                             │
│  单实例锁 / second-instance / │  │                             │
│  will-quit / window-all-     │  │                             │
│  closed                      │  │                             │
└───────┬──────────────────────┬──┴─────────────────────────────┘
        │                      │
        │  Host-specific：     │
        │  见下两分支           │
```
                             │                      │
        ┌────────────────────┴─────────┐  ┌─────────┴─────────────────────┐
        │ Workflow Host (in-process)   │  │ Standalone Host (bridge)      │
        │ workflow-plugin/main.js      │  │ electron/main/main.js         │
        │                              │  │                              │
        │ WorkflowIntegration.node     │  │ createBridgeExecutionAdapter()│
        │  → getResolve()              │  │  → HTTP :49371 /health,/command│
        │ createResolveAdapter({       │  │  → bridge/server.py           │
        │   getResolve })              │  │  → resolve/adapter.py          │
        │ marker backend:              │  │ marker backend:               │
        │   workflowPluginApi          │  │   resolveScriptApi            │
        │ hostContextProvider:         │  │ hostContextProvider:          │
        │   resolve.GetVersionString() │  │   bridge.getResolveVersion()  │
        │ app.setPath(userData,        │  │ executeStandaloneCommand      │
        │   "Clackly Workflow Plugin") │  │  (error 包装带指引)            │
        │ ResolveQuit 回调 → app.quit  │  │ app.on("activate") 重建窗口    │
        │ hotkey 失败 → dialog 警告    │  │ (无 hotkey 失败处理)           │
        │ cleanupWorkflowIntegration   │  │                              │
        └──────────────────────────────┘  └──────────────────────────────┘
```

## 2. 组件对照表

| 组件 | Workflow Host 创建 | Electron Host 创建 | 参数差异 | 分类 |
|---|---|---|---|---|
| `createResolveAdapter` (resolve/adapter.js) | ✅ `{ getResolve }` | ❌ | Workflow 专用（in-process native API） | Host-specific Adapter (Workflow) |
| `createBridgeExecutionAdapter` (execution-adapter/bridge.js) | ❌ | ✅ 无参（默认 URL/env） | Electron 专用（HTTP bridge） | Host-specific Adapter (Electron) |
| `createMarkerCapability` (capability/marker.js) | ✅ | ✅ | backend 注入不同：`workflowPluginApi` vs `resolveScriptApi`；keyboardShortcut 相同 | Shared Core（注入 Host adapter） |
| `ShortcutManager` | ✅ `new ShortcutManager()` | ✅ 同 | 无 | Shared Core |
| `createCapabilityRegistry` | ✅ `register("marker.add", …)` | ✅ 同 | 无 | Shared Core |
| `registerScriptCapabilities` | ✅ | ✅ | 同（registry, appRoot, runtimeManager） | Shared Core |
| `ScriptCapabilityProvider/ScriptExecutor/PythonProvider`（默认 wiring） | ✅（由 registerScriptCapabilities 构造） | ✅ 同 | 无 | Shared Core |
| `RuntimeManager` | ✅ | ✅ | 构造参数相同；**hostContextProvider 实现不同**（GetVersionString vs bridge getResolveVersion） | Shared Core（依赖注入 Host 差异） |
| `resolveRuntimeRoot` | ✅ | ✅ | 同 | Shared Core |
| `AfterEffectsLauncher` | ✅ | ✅ | 同（`{hostEnvironment: process.env, temporaryRoot: app.getPath("temp")}`） | Shared Core |
| `ConfigManager` / `ConfigStorage.fromAppData` | ✅ | ✅ | 同 | Shared Core |
| `FeatureCatalog` | ✅ | ✅ | 同 | Shared Core |
| `FeatureStatusManager` / `FeatureStateStorage.fromAppData` | ✅ | ✅ | 同 | Shared Core |
| `createCommandExecutor` | ✅ | ✅ | 同（registry, configManager, featureStatusManager） | Shared Core |
| `InteractionManager` / `BindingStorage.fromAppData` | ✅ | ✅ | executeCommand 包装不同：`executeWorkflowCommand` vs `executeStandaloneCommand` | Shared Core（注入 Host 入口） |
| `registerFeatureUiIpc`（调用方） | ✅ | ✅ | 同（ipcMain, dialog, featureCatalog, configManager, featureStatusManager, interactionManager, openSettings, closeSettings） | **Host Bootstrap**——调用直接消费 Electron `ipcMain`/`dialog`（feature-ui/registerIpc.js:1-36）；模块注册逻辑可复用，但必须由 Host-side call 使用；Composition Root/Core 不得 import/感知 Electron API |
| `composeStartup` | ✅ | ✅ | Workflow 额外传 `handleHotkeyRegistrationFailure` | Host Bootstrap |
| window/hotkey helpers（window.js/hotkey.js） | ✅ | ✅ | 同；直接依赖 Electron BrowserWindow/globalShortcut/screen | Host Bootstrap |
| IPC handler invocation（commands:list/search/execute、interactions:execute、palette:hide + feature-ui 通道） | ✅ | ✅ | 同；注册于 ipcMain | Host Bootstrap（handler 逻辑调用 Core service，注册骨架属 Host） |
| `app.setPath("userData")` | ✅ Workflow Plugin | ❌ | Workflow 专用 | Host-specific |
| WorkflowIntegration 初始化/清理/ResolveQuit | ✅ | ❌ | — | Host-specific (Workflow) |
| `app.on("activate")` | ❌ | ✅ | — | Host-specific (Electron) |
| hotkey 失败 dialog | ✅ | ❌（composeStartup 默认 noop） | — | Host-specific (Workflow) |
| 命令执行错误包装（standalone 指引文案） | ❌ | ✅ | — | Host-specific (Electron) |
| 单实例锁 / second-instance / will-quit unregisterAll / window-all-closed | ✅ | ✅ | 同 | Shared Bootstrap |

## 3. 分类汇总

- **Application Core Composition（两 Host 以相同规则创建/注册、不依赖 Electron API）**：CapabilityRegistry、marker.add 注册、registerScriptCapabilities（含默认 ScriptCapabilityProvider→ScriptExecutor→{python: PythonProvider} wiring）、ShortcutManager、ConfigManager、FeatureCatalog、FeatureStatusManager、CommandExecutor、InteractionManager、AfterEffectsLauncher、RuntimeManager 构造骨架。证据：`workflow-plugin/main.js:108-186` 与 `electron/main/main.js:36-87` 逐行等价。
- **Host Bootstrap（两 Host 逐字重复，但直接依赖 Electron API，不因重复而升级为 Core）**：composeStartup（electron/main/composeStartup.js:1-16）、window.js、hotkey.js、单实例锁、IPC handler 注册骨架与 invocation（含 registerFeatureUiIpc 的调用，消费 ipcMain/dialog）、palette 显示/隐藏、lifecycle（activate/will-quit/window-all-closed）。共享 application services 与 Host bootstrap duplication 分开计：前者是 Core 候选，后者仍属 Host。
- **Host-specific Adapter**：
- **Host-specific Adapter**：
  - Workflow：WorkflowIntegration.node 加载/初始化/清理（workflow-plugin/main.js:44-105, 264-279）、`createResolveAdapter`（resolve/adapter.js:136-144）、`workflowPluginApi` backend（main.js:109-119）、userData 重定向（main.js:42）、hotkey 失败 dialog（main.js:247-262）、ResolveQuit 回调。
  - Electron：`createBridgeExecutionAdapter`（execution-adapter/bridge.js:103-128）、`resolveScriptApi` backend（electron/main/main.js:38-44）、hostContextProvider 用 bridge（main.js:59-62）、`executeStandaloneCommand` 错误指引（main.js:89-101）、`app.on("activate")`（main.js:180-184）。
- **Shared Core 中唯一参数差异点**：`RuntimeManager` 的 `hostContextProvider`（workflow 直连 GetVersionString；electron 走 bridge health）；`InteractionManager.executeCommand` 的包装函数。

## 4. 可安全抽离项（附证据）——见 03-composition-classification.md

## 5. 关键事实差异（与预设不符处）

1. **预设 "workflow-plugin/main.js" 是插件入口**——实际它也是完整 Electron app（require electron，有自己的 `app`/`ipcMain`/单实例锁），与 standalone main.js 共享约 90% 构造代码。
2. **`resolve/adapter.js` 与 `resolve/adapter.py` 是两套不同实现**：JS 版只服务 Workflow Host（in-process）；Python 版只服务 standalone bridge（HTTP）。同名不同职责。
3. **Script capability 注册只在 Host 入口发生一次**：`registerScriptCapabilities` 已把 provider/executor wiring 封装为默认参数，Phase 1 抽离它不会改变行为（capability/registerScripts.js:10-45）。
