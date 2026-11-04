# #6 Command Search 实现与验收记录

2026-11-04。执行范围为 [#6 当前已批准并发布要求](https://github.com/Wutpeach/Clackly/issues/6)。实现基于 main / c29a1a3；用户在收到本地候选和本记录后确认「验收通过」，随后授权将 #6 代码与本记录单独提交，并在核对范围后 Push。此为用户验收结论，自动化证据另列如下；尚未正式发行。

## 实现

- 三类命令共用 Pin/Unpin。Preferences 在原有 preferences.json 保存稳定 Command ID，写入保留 locale 及其他字段；保存失败保留原状态并显示本地化反馈。
- Recent 复用 command-usage.json。注册命令在 Capability 正常返回后记录，失败和前置拒绝不新增记录。普通脚本在 api_returned 且没有显式 false 时记录，null 可接受；这只说明调用 API 返回，绝不声称外部脚本已经执行成功或完成。submission_unknown 不记录、不重试。
- 普通脚本只有 Pin 或实际调用记录才进入空查询 Launcher；未使用的脚本仍需搜索。发现失败或来源消失时隐藏结果，保留用户历史以便按稳定 ID 恢复。
- 文本相关性的完整排序元组优先于 Pin 和使用习惯；相同匹配时三类来源平等，最终保持稳定来源顺序。中文、拼音、英文、keywords 和弱单字母规则沿用原实现。
- 搜索和 Launcher 的原有 30px 行内显示 Clackly、Extension 名称，或 Script / User、System / Python、Lua / 相对目录。全称与来源可在 title 提示和无障碍说明中查看。面板保持 240×320。
- 脚本发现失败显示一条简短搜索反馈，内置与 Extension 结果仍可用；既有不可用、Disabled、缺配置及执行失败反馈保留。没有新 Alias UI、搜索框架、插件协议或生命周期变更。

## 自动化证据

下列路径相对 resolve-command-center。build/ 是本地证据目录，不随 Release 发布。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Node 全组 | 458/458 PASS | build/command-search-node-tests.log |
| 新 Palette 集成、ExtensionManager、Extension Python、普通脚本适配器 | 19/19 PASS | build/command-search-integration-tests.log |
| 最终构建后的 Palette E2E | PASS | build/command-search-ui-final.log |
| #4/#5 既有 Settings/Palette 安装执行 E2E，真实 Core/文件系统/Python | PASS | build/command-search-extension-ui.log |
| Palette default、Pinned/Recent、Search、Info、失败反馈 | 5 个场景 PASS | build/command-search-palette-regression.log；build/command-search-evidence/palette-final/ |
| Vite production build | PASS | dist/renderer/ |
| 本地 Electron/Workflow 包完整性与两种 CPython 启动检查 | PASS | build/command-search-package-v2.log；build/command-search-workflow-package.log |

新增 E2E 使用 headless Edge、正式构建的 Renderer、真实 Core 和临时用户目录。Resolve 调用由测试回执替代，浏览器 API 桥替代 Electron IPC；不连接生产 Resolve。覆盖同名四条结果、Pin 排序、键盘 Enter/Escape、Core 重建、Unpin 后 Recent、保存失败、发现失败与恢复，以及同 ID Replace/Update、Disabled、卸载和重装。重装保留用户原先的 Disabled 选择。

截图：build/command-search-evidence/same-name-search.png、pinned-recent-launcher.png。视觉检查确认名称为主体、来源为弱文字、尺寸与行高未增加。设计检测只有原有颜色/圆角 advisory，没有新增检测项。

## 本地候选

- 版本 0.1.5，明确 nonpublishable，dirty 来源如实记录；构建候选时实现尚未提交或 Push，未创建 Tag 或 Release。后续源码提交不改变此候选的构建来源与发布资格。
- Workflow ZIP：build/command-search-candidate-v2/workflow/Clackly-Workflow-0.1.5-win-x64.zip。
- ZIP SHA-256：94bfe29bb879463954cbbdcc099c9c336a55a440dd45660aefd890ff2a15fcd6。
- ZIP 内 5,360 个清单文件。
- Inno 安装包：build/command-search-candidate-v2/setup/Clackly-Setup-0.1.5-win-x64.exe，28,964,192 bytes，unsigned / nonpublishable。SHA-256：a7ab149bf87255cf768e3711a33e6f3d1228c4131fd436c8049838e8967c19ed。
- 安装包构建退出码 0；完整来源与哈希见 setup/build-report.json，日志见 build/command-search-setup-build.log。候选交付时未由代理安装，安装和真实 Resolve 操作交由用户负责；用户随后确认验收通过。
- 起始已有的 20 个安装器/更新路径原样保留；其中已跟踪的 9 个文件仍为 358 additions / 77 deletions。候选包按既有打包流程包含当前工作区来源，不把既有未提交工作冒充 #6 新实现。

## 用户实机验收：通过

2026-11-04 用户反馈：「验收通过」。保留这项整体验收结论，不追加未经提供的逐项观测或截图。

用户明确要求亲自负责真实 Resolve 操作，因为其中包含生产资料。代理仅曾启动 Resolve 并停在项目管理器，没有打开、创建、修改或删除项目；用户澄清后不再操作 Resolve。真实使用验收由用户完成，自动化不作为原生窗口或实际执行效果的独立证明。

本轮交付的手测清单如下，由用户选择本地测试项目及已知无副作用的测试脚本：

1. 搜索一个普通 Python/Lua Script，Pin 后回到 Launcher；重启 Clackly/Resolve 后核对保留，Unpin 后核对行为。内置及 Extension 的 Pin 同样核对。
2. 调用测试 Script 和只读 Extension，核对 Recent；关闭并重开后核对保留。普通脚本只观察实际效果和 API 提交语义，不把 Recent 当作执行成功证明。
3. 核对同名结果的来源、完整提示、箭头/Enter/Escape。对相同文本匹配等级核对 Pin 排序；更强的名称匹配仍应优先。
4. 对测试 Extension 做同 ID Replace/Update，再核对 Pin/Recent；禁用后不可执行，卸载后结果消失。恢复同 ID 后核对习惯保留及既有配置。
5. 核对不可用、缺配置和执行失败的提示。普通脚本发现失败不应阻断其他来源，重新呼出面板可以刷新。

验收结论：通过。历史 usage 没有结果字段，保留原记录而不追溯猜测旧失败。自定义 Alias 延后。用户随后授权将已验收的 #6 实现与本记录单独提交，并在核对范围后 Push；既有安装器/更新未提交改动不纳入该提交。Release 发布不在本次范围内。
