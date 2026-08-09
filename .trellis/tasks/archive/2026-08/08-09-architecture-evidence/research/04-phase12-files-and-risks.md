# 04 — Phase 1/2 预计修改文件与风险（基于证据的提案）

> 本清单是给 Phase 1/2 的待批准提案，不是实施计划。

## Phase 1 — 共享 Application Composition Root

### 预计新建
| 文件 | 内容 |
|---|---|
| `resolve-command-center/app/`（或按仓库目录规范的新模块）`createClacklyCore.js` | 从两个 Host 抽出共享 wiring（03 表第 1 节全部项）；接收 Host 注入的 adapter/参数 |
| `createClacklyCore.test.js` | 用 mock dependencies 断言构造结果（Phase 1 任务建议的 characterization-first） |

### 预计修改
| 文件 | 改动 |
|---|---|
| `workflow-plugin/main.js` | 删除共享构造代码块（main.js:108-186 大部分），改为构造 Host adapter（getResolve/WorkflowIntegration/backend）→ 调 createClacklyCore → 保留 lifecycle/IPC/窗口协调 |
| `electron/main/main.js` | 同上（main.js:36-87 大部分） |
| `capability/registerScripts.js` | 保留（已是共享 registration 的唯一来源）；若 Root 直接调用则无改动 |
| `electron/main/composition.test.js`（本阶段新增） | 按新 wiring 更新 canary（抽离后共享清单断言点变化） |
| `scripts/stage-managed-python.test.js:74-86` | "both production hosts inject…" 断言需跟随 host 构造变化复核 |

### 保持不变（Boundary 检查）
- Command→Capability→Provider 调用关系（command-engine/executor.js:22-38）
- IPC channel、manifest、command/capability id、执行语义
- marker capability 与 script capability 行为
- **Host bootstrap 不进 Core**：`registerFeatureUiIpc` 的 invocation（消费 ipcMain/dialog，feature-ui/registerIpc.js:1-36）、IPC handler 注册骨架、composeStartup、window.js、hotkey.js、app lifecycle（单实例锁/second-instance/activate/will-quit/window-all-closed）在 Phase 1 后仍留在各 Host；两 Host 重复调用 registerFeatureUiIpc 是 bootstrap duplication，不是 Core duplication，Root 不暴露也不消费任何 Electron API

## Phase 2 — Script Capability 接入 Runtime Readiness

### 预计新建/修改（最小委托点，以 Phase 0 证据定 API）
| 文件 | 改动 |
|---|---|
| `script-runtime/ScriptCapabilityProvider.js` | 新增 availability 查询（委托给 scriptExecutor）——当前无（02-readiness §2） |
| `script-runtime/ScriptExecutor.js` | 新增按 runtime 查 provider 的 availability 委托；或由 ScriptCapabilityProvider 直接持有 executor 的 provider map 查询 |
| `script-runtime/providers/PythonProvider.js` | 暴露/复用稳定 probe result（不解析散字符串）；现无 probe 方法 |
| `capability/script.js` | 给 script capability 增加 `checkAvailability`（现状：只有 metadata+execute） |
| `capability/script.test.js`（本阶段新增） | 断言形状从"无 checkAvailability"更新为新契约 |
| `feature-status/FeatureStatusManager.js` | **预计无改动**（通用路径已支持 ready/missing-dependency/unavailable/error；只需 capability 提供合法 probe result）；若需要 loading 语义复用现有 loadingRecord |
| `script-runtime/runtime/manager.js` | 预计仅暴露最小 probe 委托点（现 readiness 在 execute 内，manager.js:131-145）；或直接在 Phase 2 复用现有 probe collaborator 而不改 manager 公开 API |

### 复用而非新建
- probe 返回结构 + `RuntimeProbeCache`（防高频 spawn）
- `RuntimeError` 全套 code（02-readiness §4）
- FeatureStatusManager 的 normalizeProbeResult 校验（FeatureStatusManager.js:16-55）

## 风险清单

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | **Script feature 当前永远显示 ready**，执行时才暴露 RUNTIME_* 错误——Phase 2 若不做，Settings 误导延续；若做，首次 probe 可能触发真实子进程（用户可见延迟） | 中 | 复用 probe cache；首次 status 读取走 cache miss 时只做轻量 fingerprint 检查，probe 延迟到 refresh |
| R2 | **两 Host 共享 `runtime-probe.json` 与 `%APPDATA%/Clackly` 数据**：Workflow 与 standalone 并存时并发读写，last-writer-wins（ConfigManager.js:33 注释） | 中 | 抽离时保持现状；Phase 1 不改文件布局；可另立任务评估锁 |
| R3 | **`hostContextProvider` 是 RuntimeManager 唯一参数差异点**：Workflow 用 GetVersionString（可能失败时抛错→RESOLVE_VERSION_UNVERIFIED），Electron 用 bridge health（失败→isAvailable=false 不抛）。抽离后必须保留该差异注入语义 | 中 | 作为 Host 参数注入 Root，Root 不做统一化 |
| R4 | **marker backend 选择顺序**（MARKER_BACKENDS: resolveApi→resolveScriptApi→workflowPluginApi→keyboardShortcut→uiAutomation，capability/marker.js:3-9）：Workflow Host 注入的 workflowPluginApi 与 Electron 注入的 resolveScriptApi 属不同优先级位置；统一注入接口时不得改变实现/顺序语义 | 低 | 保持 MARKER_BACKENDS 常量不变 |
| R5 | **静态源码 canary 测试（composition.test.js）依赖文本匹配**：重构时若 import 路径/构造写法变化会误报 | 低 | 测试已按"变化即更新"设计，Phase 1 任务内维护 |
| R6 | **无独立 lint/typecheck/build CI job**：package.json 只有 test；vite build 仅构建 renderer。CI 配置缺位（未见 .github/workflows） | 低 | 基线记录现状；如要引入由用户决定 |
| R7 | **预设与仓库差异**：a) workflow-plugin/main.js 本身是完整 Electron app（非薄插件入口）；b) resolve/adapter.js（JS, Workflow）与 resolve/adapter.py（Python, bridge）同名不同实现；c) script capability 无 checkAvailability（预设的链路在第 3 层就断了，必须由 Phase 2 补）；d) `FeatureStatusManager` 六态已全部存在，Phase 2 无需新增 status | 低 | 本报告 01/02 已明确记录 |
| R8 | **Resolve 启动冻结历史问题**（memory: resolve startup freeze context）与本次重构无关；Phase 1/2 不触碰 WorkflowIntegration 初始化路径 | 低 | 本阶段不改 workflow-plugin/main.js:44-105 |

## 测试基线（本阶段新增的 characterization tests）

| 测试 | 固化内容 |
|---|---|
| `capability/script.test.js`（新增，3 测试） | script capability 只有 {metadata, execute}，**无 checkAvailability**；execute 委托携带 command/config/capabilityId |
| `capability/registerScripts.defaultWiring.test.js`（新增，1 测试） | 默认 wiring 全链：registry→capability→ScriptCapabilityProvider→ScriptExecutor→{python: PythonProvider}→runtimeManager，装载 shipped ae-export 定义 |
| `electron/main/composition.test.js`（新增，4 测试） | 两 Host 的共享 composition 清单 + Host 差异（adapter/backend/lifecycle）+ IPC surface |

全部只断言现状，不改变产品行为；删除这三个文件即可独立回滚。
