# Issue #16：双语文档审查与截图候选

2026-11-09 · 基于已上线的 `7f0de440878ede48fc5e1a07bc50305eb62a3c67`。本轮仅修改 `site/`，等待内容与视觉验收；未合并、未发布文档候选。

## 审查结果

逐页审查了 15 对中英文人工维护页。主要问题是重复的版本/标题摘要、操作步骤夹杂实现历史，以及兼容性和验证限制分散重复。现改为可操作的摘要与步骤，将兼容性集中在概览、安装限制留在安装页，相关页面通过链接引用。

| 页面（中英同步） | 发现与处理 | 必要保留或暂不修改 |
| --- | --- | --- |
| 文档概览 | 精简入口说明；把“完成 Resolve 安装”改为“在 Resolve 中加载 Clackly” | 公开版本、Windows/Studio 兼容范围、Agent 入口 |
| 下载与安装 | 明确官方 EXE、重启 Resolve 后加载插件的菜单顺序 | 未签名、SHA-256、本机官方 native 来源；离线/UAC/完整卸载未专项验收 |
| 首次使用 | 明确加载、呼出、搜索、执行、返回；补 Launcher 实拍 | 写操作需确认对象、使用可丢弃本地工程；Info 与鼠标映射 |
| Launcher 与搜索 | 删去历史截断/选择修复叙述，直接说明 Pin、Recent、搜索；补来源标签截图 | 普通 Python/Lua 脚本入口与扩展包区别、元数据匹配范围 |
| Settings | 将配置过程改为三步，使用真实“保存更改 / 放弃修改”按钮名；补 AE 配置截图 | 草稿、依赖状态、启用不等于就绪 |
| 扩展管理 | 精简安装与替换步骤；补列表条目查看详情及真实管理截图 | 本地代码、无沙箱、作者声明来源；保留配置与会话影响 |
| Command UI 与 Views | 用单次表单/持续窗口解释区别；快捷键改为短列表；补真实表单 | 刷新后重新确认、会话草稿、关闭/超时不等于取消或回滚 |
| 升级 | 将“v0.1.5 用户”明确为“从 v0.1.5 起”；分清应用、扩展和 Skill 更新 | 用户自行保存和重启 Resolve；旧版需手动安装 |
| 排错 | 按症状精简；兼容性与安装验收限制改为引用集中说明 | 区分未加载与命令失败；失败写入后先检查实际数据 |
| 发行历史 | 仅替换重复摘要；核对版本、发布日期和发行能力 | 正文保留，没有把开发中能力写成公开发行 |
| Build with AI 入门 | 精简内部构建/审计叙述，突出安装 Skill、描述目标、验证和打包路径 | 官方 Skill 单一 authority，实际宿主验证要求 |
| 获取 Developer Skill | 精简四步导入流程；补真实 Skill 获取控件裁切 | 完整资料、覆盖需用户同意、云端查阅与本机导入区别 |
| Agent 提示词 | 审查后不修改 | 六组可复制完整任务提示词及其安全/验证要求 |
| 官方示例 | 仅替换重复摘要；核对官方示例路径 | 示例说明与原始源码/打包入口保留 |
| 验证与打包 | 仅替换重复摘要；核对命令与原始脚本 | 完整验证流程、安装和 Host 验收区别 |

四对自动生成的协议页不直接编辑。`skills/clackly-developer/`、六组提示词、19 份机器可读原文、示例和打包脚本保持原样。没有改动产品首页、应用代码、依赖、CI 或 Pages 门禁。

## 代表性前后变化

| 原表述/结构 | 本轮候选 |
| --- | --- |
| 页面标题后再显示“Clackly v0.1.6 使用说明：Settings 与功能配置” | 摘要改为“切换语言、补齐功能依赖并保存配置。” |
| 概览入口“完成 Resolve 安装” | “在 Resolve 中加载 Clackly”，避免误以为此页安装 Resolve |
| Settings 用长段落解释选功能、依赖、保存 | 选择功能 → 补齐配置 → 点击“保存更改”并检查状态 |
| Launcher 混有旧九条截断和选择修复历史 | 直接说明固定、最近使用、分组、键盘选择与来源标签 |
| “v0.1.5 用户可以……” | “从 v0.1.5 起……”，涵盖当前 v0.1.6 |
| 多页重复列出平台限制与安装未验收项 | 概览/安装集中说明；排错页给直接链接 |

英文页对应调整意义和操作，不要求逐字翻译。应用按钮名与对应语言的实拍一致；扩展作者定义的中文字段不伪造英文翻译。

## 版本与事实来源

- 最新公开版本：[v0.1.6](https://github.com/Wutpeach/Clackly/releases/tag/v0.1.6)，2026-11-08；源码 `d883c97b3cf6cc4dd61757f762a73b28625ea2c2`。
- 官方资产：`Clackly-Setup-0.1.6-win-x64.exe`，28,965,825 字节，Release 记录 SHA-256：`00d1400b8e67678d6e67c51da065c30ca2a4884478e32d7fa3269da8b9b4fb25`。仅核对元数据，没有另行下载安装器或声称安装验收。
- [Tag CI](https://github.com/Wutpeach/Clackly/actions/runs/42477636440) 及 v0.1.5、v0.1.3、v0.1.2 官方发行记录用于核对更新路径和发布日期。
- 当前 production 应用代码与可执行示例相对 `v0.1.6` 无差异。最新 main 已包含五份测试/测试调度文件和七份 Skill Markdown 的后续修改，均非本轮改动；Skill 原文以当前 authority 导出，并非声称与 Release 的每份文档相同。采集脚本从仓库根目录核对差异并在 manifest 中逐项记录。操作说明对照真实 renderer、feature/extension IPC、偏好/本地化服务、Developer Skill 与官方示例，不从首页演示图推断应用能力。

## 应用截图来源

[采集脚本](../../scripts/capture-docs-runtime.mjs) · [逐图尺寸、字节数和 SHA-256](../../public/images/docs/provenance.json)

环境：Windows，Electron 36.3.2，production 构建 renderer/preload、真实 Core/IPC 与 Python。使用既有 Electron 集成测试 fixture 启动，临时 AppData；安装官方 `run-summary` 扩展包，实际执行一次不依赖 Resolve 的摘要命令后进入 Recent，并固定真实 `timeline.addMarker`。没有读取或修改用户 Resolve 工程，也没有改动应用源码。

| 12 张双语 2x 无损 WebP | 用途 |
| --- | --- |
| `launcher-zh/en.webp`（480×640） | 首次使用：Pinned、真实成功执行后的 Recent、Commands |
| `search-zh/en.webp`（480×640） | 搜索：摘要命令与扩展来源 |
| `settings-zh/en.webp`（1520×1120） | Settings：未配置 AE 路径与需要设置状态 |
| `extensions-zh/en.webp`（1520×1120） | 已安装扩展详情、版本/来源、配置、停用/卸载 |
| `command-ui-zh/en.webp`（960×1160） | 官方摘要命令实际打开的静态表单；更多字段在窗口内滚动 |
| `developer-skill-zh/en.webp`（1064×254 / 1064×322） | Settings 中复制提示词与打开 Skill 文件夹的相关区域 |

合计约 310 KiB；原图有描述性 alt、真实尺寸，并可通过键盘打开。按用户反馈，截图在正文中居中，不显示采集说明和“点击查看原图”等图片下方标注；来源和验证边界集中保留在本记录、manifest 与 Issue。页面缩放只用于排版，没有重绘或美化应用 UI。

边界：未连接 Resolve，内置命令如实显示不可用或需要设置；extension readiness 与 update-state adapter 用于隔离测试，不能证明真实宿主就绪或更新检查。未运行 AE 导出。示例并非应用预装扩展，其作者定义的中文字段在英文应用 UI 下仍保留中文。截图不含 OS frame/shadow。

未补安装器/Resolve 菜单或实时项目的 Extension View 截图：本轮没有取得这些场景的安全实机证据，不以 mock 冒充。当前图片证明真实应用界面及上述操作，不证明 Workflow Integration、DWM、宿主项目兼容性或完整安装验收。

## 网站预览与页面截图

本地候选：[中文文档](http://127.0.0.1:4321/Clackly/docs/) · [English](http://127.0.0.1:4321/Clackly/en/docs/)。仅在运行预览的本机可访问。PR 的 Docs site CI 提供构建站点 artifact，可下载后本地预览；公开 Pages 仍为 #14 发布版本。

以下为实际构建站点的 Edge 浏览器截图，非应用截图来源；已检查字体、图片、布局和主题。

- [首次使用：中文桌面浅色](first-use-zh-desktop-light.webp)
- [First use：英文手机深色](first-use-en-mobile-dark.webp)
- [Settings：中文桌面深色](settings-zh-desktop-dark.webp)
- [Extensions：英文手机浅色](extensions-en-mobile-light.webp)
- [Developer Skill：中文手机浅色](developer-skill-zh-mobile-light.webp)
- [Command UI：英文桌面浅色](command-ui-en-desktop-light.webp)
- [Launcher 搜索：中文桌面浅色，图片居中且无下方标注](launcher-zh-desktop-light.webp)

## 验证

- 应用构建通过，仅用于真实 UI 采集；采集脚本确认只执行一次非 Resolve Python 示例、无 pageerror。
- 站点构建通过：41 份 HTML、19 对双语页面、3,032 项内链/资源/锚点，19 份官方原文逐字节一致。
- 完整站点 Playwright：26/26；最终摘要与按钮文案调整后，受影响文档测试再次 14/14。包含六类插图页的中英 1440/390/320px、原图键盘打开、资源加载与无溢出，以及 Agent 复制、剪贴板失败回退、搜索、双语/主题/导航。
- 图片居中与移除标注后，文档 14/14 再次通过；六类双语插图页均验证 1440/390/320px 下图片居中、无下方标注且原图仍可键盘打开。七张网页验收截图已更新。
- 实际打开本地生产预览，并检查上述六张浏览器截图。没有录屏。
- 按反馈删除图片下方标注及对应样式后，Impeccable detector 无发现。
- `git diff --check`、截图 manifest 的大小/哈希核对与改动范围核对通过。PR 的最终 HEAD/CI 以 Issue 回写收据为准。

本机 Node 22.17.1 低于声明的 22.19.0，以上本地检查实际通过；CI 使用声明支持的版本。应用依赖安装报告的既有 audit 项不在本次文档改动范围，没有为此更新应用依赖。
