# 03 — Core/Host 分类：抽离 vs 保留（附代码证据）

## 1. 建议抽到 Composition Root（Application Core Composition）

判定标准（design.md 分类规则）：两个 Host 必须以相同规则创建/连接、不直接依赖 Electron/Workflow Integration/native bridge 的应用级 service 与共享 registration。

| 模块 | 代码证据（两 Host 均以相同参数构造） |
|---|---|
| `createCapabilityRegistry` + `register("marker.add")` | workflow main.js:125-126；electron main.js:45-46 |
| `registerScriptCapabilities`（含默认 ScriptCapabilityProvider→ScriptExecutor→{python: PythonProvider} wiring） | workflow main.js:151；electron main.js:68；构造在 capability/registerScripts.js:23-28 |
| `ShortcutManager` | workflow main.js:108；electron main.js:37（均 `new ShortcutManager()`） |
| `createMarkerCapability`（backend 差异注入：workflowPluginApi vs resolveScriptApi） | workflow main.js:109-124；electron main.js:38-44 —— backend 是 Host adapter 参数，capability 本身是共享 Core |
| `ConfigManager` + `ConfigStorage.fromAppData` | workflow main.js:153-156；electron main.js:70-73 |
| `FeatureCatalog` | workflow main.js:152；electron main.js:69 |
| `FeatureStatusManager` + `FeatureStateStorage.fromAppData` | workflow main.js:157-161；electron main.js:74-78 |
| `createCommandExecutor` | workflow main.js:162-166；electron main.js:79-83 |
| `InteractionManager` + `BindingStorage.fromAppData`（executeCommand 注入） | workflow main.js:182-185；electron main.js:84-87 |
| `AfterEffectsLauncher` | workflow main.js:128-131；electron main.js:48-51（同参 `{hostEnvironment, temporaryRoot}`） |
| `RuntimeManager` 构造骨架（hostContextProvider 注入） | workflow main.js:132-150；electron main.js:52-67（唯一差异 = hostContextProvider 实现） |
| `resolveRuntimeRoot` | workflow main.js:133-135；electron main.js:53-55（同参 `{appRoot}`） |

证据强度：workflow-plugin/main.js:108-186 与 electron/main/main.js:36-87 逐行对比，除 4 处 Host 差异（下述）外全部等价。新增 canary 测试 `electron/main/composition.test.js` 已固化该清单。

## 2. 必须留在 Host 的模块（Host-specific Adapter / Bootstrap）

| 模块 | 理由 | 代码证据 |
|---|---|---|
| WorkflowIntegration.node 加载/初始化/`GetResolvePromise`/`RegisterCallback("ResolveQuit")`/`CleanUp` | 直接依赖 native 桥 + Resolve 进程生命周期 | workflow-plugin/main.js:44-105, 264-279 |
| `createResolveAdapter({ getResolve })` | 只为 Workflow 的 in-process Resolve 对象服务 | workflow-plugin/main.js:107；resolve/adapter.js:136-144 |
| `workflowPluginApi` marker backend（isAvailable 用 getResolve） | Host adapter | workflow-plugin/main.js:109-119 |
| `createBridgeExecutionAdapter()` | 只存在于 Electron standalone（HTTP 客户端） | electron/main/main.js:36；execution-adapter/bridge.js:103-128 |
| `resolveScriptApi` marker backend | Host adapter | electron/main/main.js:38-44 |
| `hostContextProvider`（GetVersionString vs bridge getResolveVersion） | 两者语义相同但实现源不同；应作为参数注入 Root，实现留在 Host | workflow main.js:139-145；electron main.js:59-62 |
| `executeWorkflowCommand` / `executeStandaloneCommand`（命令错误包装） | 各自生命周期/指引文案 | workflow main.js:168-180；electron main.js:89-101 |
| `app.setPath("userData")`（Workflow 专用数据目录） | Host 存储布局 | workflow main.js:42 |
| hotkey 失败 dialog（Workflow 独有） | Host UX | workflow main.js:247-262（composeStartup 默认 noop 参数） |
| `app.on("activate")`（Electron 独有） | Host lifecycle | electron main.js:180-184 |
| **`registerFeatureUiIpc` 的调用** | **调用直接消费 Electron `ipcMain`/`dialog`（registerFeatureUiIpc.js:1-36 参数即 ipcMain/dialog）**；模块注册逻辑（channel→service 映射）可复用，但必须由 Host-side call 使用。Composition Root/Core 不得 import 或感知 Electron API——因此 invocation 留在 Host bootstrap，即使两 Host 调用完全相同 | workflow main.js:235-244；electron main.js:151-160；feature-ui/registerIpc.js:1-36 |
| **IPC handler invocation（commands:list/search/execute、interactions:execute、palette:hide）** | 注册于 `ipcMain`；handler 体内调用 Core service（executeCommand、interactionManager），但注册骨架本身是 Host bootstrap，不进 Core | workflow main.js:219-245；electron main.js:135-161 |
| window.js / hotkey.js / composeStartup | 直接依赖 Electron BrowserWindow/globalShortcut/screen | electron/main/*.js:1-204；composeStartup.js:1-16 |
| 单实例锁 / second-instance / activate / will-quit / window-all-closed | Electron app lifecycle，两 Host 逐字重复但仍属 Host bootstrap | workflow main.js:281-315；electron main.js:163-193 |
| `initializeAfterEffectsPath` | 依赖 configManager + child_process/powershell 探测（虽共享调用，但属于 Host 启动协调；可随 Root 调用但实现依赖 Node 平台能力） | workflow main.js:299；electron main.js:173；capability/afterEffectsPath.js:117-154 |

## 3. 边界判定（Uncertain → 标注风险）

- **ConfigStorage 路径**：两 Host 共用 `%APPDATA%/Clackly/`（config.json / bindings.json / feature-status.json），但 Workflow Host 把整个 userData 重定向到 `Clackly Workflow Plugin`（workflow main.js:42），而 ConfigStorage/FeatureStateStorage 用的仍是 `app.getPath("appData")`（ConfigStorage.js:21-26；FeatureStateStorage.js:16-21）—— 因此 Workflow 模式的数据落在 `%APPDATA%/Clackly/` 而非 `%APPDATA%/Clackly Workflow Plugin/`。这是**现有事实**，抽离时不得改变（若 Phase 1 想统一需另立任务）。
- **runtime-probe.json 缓存路径**：两 Host 相同（`appData/Clackly/runtime-probe.json`，workflow main.js:136；electron main.js:56），两进程可能并发读写同一缓存文件——ConfigStorage.save 用 atomic rename，但 last-writer-wins（ConfigManager.js:33 注释已声明）。抽离时保持现状。
- **`registerScriptCapabilities` 的默认 wiring 构造**在函数内部（registerScripts.js:23-28），两 Host 都没有传 `scriptCapabilityProvider`——它是事实上的共享 composition，抽离到 Root 属纯移动，无行为变化。

## 4. 建议的 Root 输入/输出（仅提案，Phase 1 定稿）

- 输入：capabilityRegistry（可选）、resolveScriptApi 类 adapter（marker backend）、shortcutManager、configStorage、featureStateStorage、bindingStorage、runtimeManager（含 hostContextProvider）、appRoot、appDataPath。
- 输出：capabilityRegistry、configManager、featureStatusManager、featureCatalog、interactionManager、executeCommand。**不含 IPC/窗口注册**——registerFeatureUiIpc 与 IPC handler 的 invocation 留在 Host bootstrap，由 Host 在拿到 Root 输出后自行调用。
- 命名/位置遵循 Phase 0 事实（`createClacklyCore(dependencies)` 仅为 Phase 1 任务示例名）。
