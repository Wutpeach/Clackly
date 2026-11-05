# Issue #7-A Extension Command UI — 开发验证

2026-11-05。依据 [Issue #7](https://github.com/Wutpeach/Clackly/issues/7) 及[已批准指令](https://github.com/Wutpeach/Clackly/issues/7#issuecomment-6656254945)；这是开发候选，等待产品验收。#7-B 未实施，Issue 保持 Open。

## 候选实现

- Command 可声明静态 `ui.version: 1`、`inputs` 和按需 `confirm`。复用 Settings 控件，支持单行/多行文本、数字、布尔、静态下拉、颜色、文件和文件夹；保留原长期设置。
- Host 校验字段、类型、大小、必填、颜色和数字范围；单次值仅通过 `context.input` 进入 Python，不持久化、不混入 `context.config`。提交绑定原 revision；更新后的版本不能继承旧表单/确认。
- 独立可聚焦的临时窗口完成 Input → Running → Result/Error。Palette/D7 的既有几何和只读边界不变；无输入/确认的命令直接执行。同一 Host 只管理一个 Command 会话，Running 防重复并拒绝关闭，无虚假取消。
- 显式 `$clackly: "result"`、`version: 1` 结果可提供文本、键值、列表及按需技术详情。未标记 JSON/日志不解释为 UI。单行且不超过 60 字符的纯成功消息轻通知；长消息、多行和实质内容保留可滚动、可复制的结果。业务失败和无效结果不计入成功 Recent。
- 复用既有包完整性、Core 命令路由和 RuntimeLauncher；填表等待不消耗正式 Python 的 10 秒限额。两个正式 Host 共用同一会话控制器；renderer 只提交单次值，不选择脚本路径或执行扩展提供的 HTML/JS。
- 更新自包含 [Developer Skill](../../skills/clackly-developer/SKILL.md)、[Command UI 协议](../../skills/clackly-developer/references/command-ui.md)及[运行摘要示例](../../skills/clackly-developer/examples/run-summary/manifest.json)。明确标记未发布的开发候选，不承诺旧 Host 支持。

## 自动化与实际 UI 证据

本轮工作位于 `main`，基线 `9bfc6c3`；本轮未提交、未推送。构建通过；保留 Vite 对较大 bundle 的提示，未扩展本轮做打包体积优化。

| 检查 | 结果 / 证据 |
| --- | --- |
| Node 逻辑回归 | 467/467，`build/issue7-node-tests.log` |
| Python 全部测试组 | 87 项通过（6+24+25+30+2），`build/issue7-python-tests.log` |
| 较广串行集成 | 最近整组 134/135，唯一失败为 Vite dev 加载超时；修复后该项冷缓存复测 1/1 通过，未再重跑整组。见 `build/issue7-integration-complete.log`、`build/issue7-vite-fixed.log` |
| 最终构建 / 差异检查 | 构建通过，`build/issue7-build-final.log`；`git diff --check` 通过 |
| 实际 Electron 与通知修复回归 | 4/4，`build/issue7-review-fix-tests.log`；包含真实 Python 10 秒超时 |
| Settings/Palette 包管理兼容 | 构建产物上的完整路径通过，`build/issue7-built-ui-integration.log` |
| Impeccable detector | 无 primary findings；5 项既有 CSS 色值/圆角 advisory，`build/issue7-impeccable-detect.json` |
| 独立视觉/实现审查 | 初次发现多行通知不可完整阅读，修复后 verdict `ship`；该 verdict 仅覆盖所报修复，不代替 Resolve 产品验收 |

首轮较广集成发现：公共 Python context 精确断言未含 `input`、30px 行高浮点断言，以及开发服务器加载超时。已同步 context 断言，将行高判定改为 0.01px 容差；Settings/Palette 集成改用构建产物，测试入口自动构建。重复快照抢回输入焦点的问题也已修复，并由 Electron Tab 回归覆盖。

最终 Vite dev 诊断确认依赖扫描默认遍历了 `build/`、`release/` 中历史安装包和测试备份的 HTML，阻塞页面模块加载。`vite.config.mjs` 将 `optimizeDeps.entries` 限定为应用的 `index.html`；开发模式测试使用独立临时缓存，修复后真实浏览器加载和命令展示通过。保留失败/诊断日志 `build/issue7-vite-diagnostic.log`、`build/issue7-vite-deps.log`，不将此前整组失败记作全绿。

Electron 证据使用独立临时 appData、真实 Core/安装器/文件系统/受限 Python 子进程和真实 preload/IPC。测试解释器显式为本机开发 Python，Resolve 可用性由隔离 fixture 提供；**不是正式 managed-runtime/Resolve Workflow 通过证明**。测试创建的临时安装已清理，未写入用户扩展状态或当前 Workflow。

实际检查：默认/必填/范围/确认阻断；取消后零执行及回到 Palette；所有控件值到 Python；单次值不保存；Tab/Enter/Escape；Running 时原生关闭拦截及重复触发只执行一次；旧 JSON 无窗口；无输入的结果/通知；业务失败、异常、无效结果和真实超时；文字作为文本展示；真实系统剪贴板复制；结果滚动；中英 Host 文案；320px renderer 布局；实际窗口工作区内定位、焦点及 topmost 状态。

本机可查看截图均在 `resolve-command-center/build/issue7/electron/`（`build/` 被 Git 忽略，不表示已上传 GitHub）：

- `input-en.png`、`input-zh.png`、`input-320.png`：输入/默认/焦点及窄布局。
- `running-en.png`、`result-en.png`、`result-details.png`、`notification.png`：运行、滚动文本、真实键值/列表与轻通知。
- `error.png`、`business.png`、`malformed.png`、`timeout.png`：异常、业务失败、无效结果及超时。
- `multiline-320.png`、`long-message-320.png`：长/多行纯消息保留完整结果。
- `receipt.json`：原生窗口状态、工作区 bounds、执行次数和 renderer errors（空）。

## 全新 Agent 的公开协议闭环

独立新 Agent 无父会话历史，仅阅读 `skills/clackly-developer/` 内公开入口、协议、示例及打包脚本。其按中文自然语言需求生成了长期前缀、全部基础单次输入、执行确认、结构化结果、无输入短通知和无输入详情三条命令；未阅读内部 React/Electron 实现。

4 项禁止访问 Resolve 的离线测试通过。公开 helper 生成的包随后在上述隔离 Electron 中真实安装和运行；该包不修改项目或外部文件。

- 源码：`build/issue7-author/source/`；离线测试：`build/issue7-author/test_offline.py`。
- 包：`build/issue7-author/run-summary-1.0.0.clackly`。
- SHA-256：`b1dbff8f2929f59bbe45c6fe47bca897ac77f7c02284fc54e329d24eeae1dab0`。

## 产品验收边界

- 原生文件/文件夹选择器已接入父 Command 窗口的 Electron dialog；测试覆盖输入与 IPC 边界、路径传递，未操作真实系统选择器，仍需人工验收。
- 未替换/部署用户当前 Workflow，未运行真实 Resolve Workflow。真实 Resolve 中的焦点归还、与其他窗口遮挡、DWM 外部阴影/边框及生产 runtime 需另行验收；`isFocused/isAlwaysOnTop` 回执不能替代这些证明。
- 第三方 Python 仍以用户权限运行，无 OS 沙箱。确认只是执行前同意。超时不保证脚本此前没有部分副作用，界面提示先检查再重试。
- 未实施 #7-B Prepare、动态选项/预填、运行中 UI RPC、后台长任务、实际取消、Lua/JS Runtime 或 #8 独立 UI Framework。未发布 Release、未关闭 Issue；等待用户产品验收。
