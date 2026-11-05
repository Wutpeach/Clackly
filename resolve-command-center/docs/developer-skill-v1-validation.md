# Developer Skill V1 开发验证与验收记录

## 当前状态（2026-11-05）

用户已确认 Developer Skill 验收，并授权将 Skill 与相关 Python 包外缓存修复
分别提交到本地 Git。本次只整理本地提交，不 Push、不发布 Release、不修改当前安装，
不更新 GitHub Issue 状态。以下开发验证及候选安装记录按发生时状态保留，
其中“待验收”和“未提交”描述历史阶段，不代表本次提交后的 Skill 状态。
用户的验收结论不替代开发侧未实际取得的真实 Resolve、native UI 或性能测试证据。

本次提交前针对性复核：Runtime/扩展管理/事务回归 18/18 PASS；
Skill 打包、实际安装器及 Runner 集成 5/5 PASS。未重复完整测试矩阵。

最新方案：按用户选择保留 Python 缓存，将其重定向至受管的包外目录。
下文 `-B` 方案及其安装包保留为历史证据，已由文末包外缓存方案取代。

2026-11-05，依据 [#3 已批准 V1](https://github.com/Wutpeach/Clackly/issues/3) 开发。
实现位于 [skills/clackly-developer](../../skills/clackly-developer/README.zh-CN.md)，
英文 SKILL.md、独立协议参考、原样复用的 Project Inspector、Python 标准库打包工具，
以及中英文安装说明可一起复制到仓库外使用。不依赖应用源码、Node、SDK 或 Git commit。

本轮工作仍在 main 未提交；未 Commit/Push，未修改现有安装，未发布 Release，未关闭 Issue。
开始时 20 个 Setup / Workflow Updater 未提交文件已记录 SHA-256，交付前逐个比较。

## 实际验证

| 检查 | 结果与边界 |
| --- | --- |
| 标准 Skill 验证器 | PASS；检查 name/description 和入口格式，不证明产品验收。 |
| 新增打包与安装集成测试 | 最终 5/5 PASS；源码/资源、异步入口、配置门禁、同版 Replace 后重开保留配置/ID、缺入口/大小写/语法/重复 ID、禁止覆盖与源内输出、排除本地杂项、拒绝目录链接。 |
| 既有 Extension 回归 | 12/12 PASS，含 Settings/Palette 无头运行的完整安装、配置、搜索、执行、Replace、启停与卸载；真实 Core/文件系统/Python，浏览器 transport 与文件选择器替代 Electron。 |
| Python Runner 单元测试 | 4/4 PASS，包含同步/异步、日志、上下文、错误及 JSON 返回值。 |
| 无仓库上下文 Agent 正向使用 | Agent 仅获得隔离临时目录中的 Skill 副本和中文自然语言需求，未继承主会话历史；交付双命令工具包、可编辑源码、中文说明及同版修改包。读写范围由委派约定限制，未建立操作系统硬沙箱。 |
| 独立产物离线测试 | 主会话分别重跑 Agent 生成的原版及修改版测试，均为 11/11 PASS；这些测试使用模拟上下文。 |
| 独立产物复核 | 主会话对原包和修改包运行实际 readPackage、ExtensionManager 和 Python Runner；2 包 × 2 命令 × 3 模拟宿主状态 = 12 次执行成功。覆盖无项目、有项目无时间线、有时间线；配置已保存，同 ID/同版本被识别为 Replace，重开仍保留配置及命令 ID。Resolve adapter 为模拟对象。 |

可复跑的针对性命令（从 resolve-command-center 执行）：

```text
node --test scripts/developer-skill.integration.js
node --test extensions/ExtensionManager.test.js extensions/registerIpc.test.js extensions/python.integration.js extensions/transaction.integration.js extensions/ui.integration.js
python -m unittest discover -s script-runtime -p test_python_runner.py -v
```

本地日志/产物在被 Git 忽略的 `build/developer-skill-v1/`：

- `packer-tests-final.log`：最终新增 5 项测试。
- `integration-tests.log`：12 项既有扩展测试和当时 4 项新增测试，合计 16/16；新增目录链接检查后单独重跑最终 5 项。
- `runner-tests.log`：Runner 4 项测试。
- `independent-tests-original.log`、`independent-tests-replace.log`：两版独立产物各 11 项离线测试。
- `independent-installer-evidence.json` 与 `verify-independent.cjs`：独立产物安装/Replace/执行证据及复核脚本。
- `independent/`：独立 Agent 的原包、修改包、源码/测试和离线记录。
- `Clackly-Developer-Skill-V1.zip`：本地验收用独立 Skill 副本，不是 Release。
- `existing-worktree.json`、`delivery-checks.json`：既有改动保护与交付检查。

## 安装和最终验收

可直接复制整个 `skills/clackly-developer/`，或解压本地独立 ZIP 得到该文件夹，
放到 Agent 支持的 Skill 目录。Cindy 项目级路径为
`<新工具工作目录>/.agents/skills/clackly-developer/`；随后新开 Agent 对话。
其他客户端使用自己的标准 Skill 导入方式。当前变更尚未 Push，GitHub 在线文件及
Download ZIP 暂不含本轮实现；待用户授权提交发布源码后才可通过仓库下载。

用户在**全新对话**仅加载 Skill，以自然语言提出真实工具需求；获得 `.clackly` 后，
自行在 Clackly Settings → Extensions 安装、保存配置、Palette 搜索并运行，
再尝试原 ID 修改后的 Replace。中英文完整说明随 Skill 提供。

最终状态：**开发验证完成，待用户新对话产品验收**。本轮不操作真实 Resolve 项目，
不声称实际菜单、日志展示、用户宿主兼容性或最终使用体验已人工 PASS。
打包工具只做基础预检，不能代替安装器全量校验；不提供依赖安装、沙箱、运行时表单
或完整 Resolve API 文档。脚本沿用 10 秒和 stdout/stderr 各 1 MiB 限制。
协议参考明确当前安装器的规范版本字符串检查拒绝 SemVer `+build` 元数据，
可用普通版本及预发行版本；本轮只如实说明现状，没有修改稳定协议或安装器。

## 新对话验收发现：首次执行后缓存导致扩展失效（2026-11-05）

用户在全新对话生成 demo.greeting，并反馈修改“称呼”后出现
`EXTENSION_FILES_CHANGED`。只读比较用户实际安装目录与 state 中的摘要发现：
greeting.py 和 manifest.json 均未变化，只有新增的
`__pycache__/greeting.cpython-314.pyc`。首次执行导入 Python 入口时生成了字节码缓存，
下一次执行/重新打开时，文件清单校验将其识别为包变化。配置保存仅写状态文件，
不是触发源码变化的原因；原演示包无需改写或重新生成业务代码。

新增回归在未修复代码下复现同一错误：首次执行成功，修改配置后的第二次执行失败。
修复仅在短生命周期 RuntimeLauncher 的 Python 参数增加 `-B`，禁止写字节码；
沿用 `-I` 隔离模式，因此不能仅依赖会被忽略的 PYTHON* 环境变量。
不放宽文件清单校验，不忽略缓存文件，也不修改已安装的 revision 或状态。

验证：扩展生命周期、真实 Python worker、运行时启动/桥接及 Skill 打包相关
**33/33 PASS**。新测试覆盖首次执行、改配置后再执行、重开后执行、不生成缓存，
并确认实际资源修改仍被拒绝、保存配置保持。另以用户提供的原样演示源码和受管
CPython 3.14.4 在临时目录完成默认称呼、保存新称呼、再次修改并重开后的 3 次执行，
日志内容正确、文件清单不变；绕过真实 Resolve Probe，只验证离线执行链路。
同样 3 次检查在实际打包后的应用代码及随包 CPython 中通过；最终生命周期测试
还确认错误状态可经同版 Replace 恢复，兼容配置仍保留。

代码仍未提交/Push；候选构建及证据位于 `build/extension-bytecode-fix/`。
当前用户安装未更新，已有缓存未被代理删除；修复部署后，通过 Settings 同版 Replace
重新导入原包可恢复干净 revision 并保留兼容配置。部署和真实 Resolve 再验收仍待用户授权/执行。

本地 nonpublishable 0.1.5 候选已完成构建和包验证，source.dirty=true，未发布 Release：

- Workflow ZIP：`workflow/Clackly-Workflow-0.1.5-win-x64.zip`，32,620,649 bytes，
  SHA-256 `98236d14a6796d672b982356ebf3dda0562b529dd9c1e03f30b1c5a81b329940`；5,360 项清单验证通过，两种受管 CPython 实际启动验证通过。
- 沿用 Inno 的安装候选：`setup/Clackly-Setup-0.1.5-win-x64.exe`，28,907,928 bytes，
  SHA-256 `13ac8bf5defc21e754983659dc924c70d9cc14c0254ea055278d145ae5ccc4d9`；只完成编译，未运行安装。
- 日志：`regression-tests.log`、`lifecycle-final.log`、`demo-evidence.json`、`packaged-demo-evidence.json`、`workflow-build.log`、`setup-build.log`。
- `demo-greeting.clackly`：按用户原样源码打包的恢复候选，供部署后手动 Replace；无业务代码变更。

## 用户确认采用包外 Python 缓存（2026-11-05）

用户选择“保留缓存，把它放到扩展包之外、由 Clackly 管理的缓存目录”。
当前实现移除前一个候选的全局 `-B`，普通 Python 任务沿用原启动行为；
ExtensionManager 为扩展生成 `extensions/cache/python/<id>/<revision>/`，
通过内部 executor 参数交给 RuntimeLauncher，以显式
`-X pycache_prefix=<绝对路径>` 传给 CPython，继续保留 `-I`。
缓存路径不从 Manifest、配置或 renderer 接收，不新增 SDK 或配置选项。

同一 revision 的缓存可跨执行和重开复用；CPython 自行区分 cache tag / 格式。
Replace/Update 分配新 revision，提交状态后尽力删除旧缓存；卸载尽力删除当前
revision 缓存。缓存清理失败不撤销已经提交的更新/卸载；中断导致的未引用残留
沿用 V1 的空间占用限制，不增加后台清理系统。禁用保留缓存，缺失缓存自动重建。
源码和资源仍执行原完整性校验，已失效的安装仍需通过 Settings Replace 恢复。

验证：相关扩展、Launcher、桥接和 Skill 集成 **33/33 PASS**，Python Runner
**4/4 PASS**。实际 worker 检查确认：缓存存在于包外、跨配置修改及重开时没有重写，
删除后可重建；Replace/Update 后旧缓存删除，新 revision 使用不同路径；卸载清理
缓存并保留用户选择保留的配置；真实资源修改仍拒绝；缓存目录链接拒绝且不写外部目标。

另外，以用户原样 demo 在临时长路径目录和受管 CPython 3.13.14 / 3.14.4 下完成
**5 次执行**：默认称呼、保存称呼、重开、切换 Python、删除缓存后重建。实际生成
`greeting.cpython-313.pyc` 与 `greeting.cpython-314.pyc`；313 缓存固定时间戳
在后续执行中保持，缓存文件绝对路径长度为 408，卸载清理成功。无真实 Resolve
连接/操作，Probe 为离线 fixture；此证据不是性能基准。

新候选及日志归于 `build/extension-external-cache/`，取代前述
`build/extension-bytecode-fix/` 的 `-B` 候选。用户当前安装未修改，等待部署授权及真实验收。

正式构建的 Settings/Palette 浏览器流程也已通过（31.4 秒），使用现有 UI 测试的
同一组交互和断言，仅将 Vite dev server 换为 production preview；包括安装、配置、
搜索执行、Replace、启停、降级、卸载与中文。测试源文件未变，切换入口仅保存在
本地 `ui-production.cjs`。开发服务器版本多次在挂载页面前的 pinyin-pro 依赖请求
超时，隔离 Vite 缓存仍未消除；这些失败日志完整保留，未将其记为通过，也未启动
其他修复任务。生产构建 UI 验证仍使用浏览器 transport/文件选择替代 Electron。

已对新打包代码和随包两种 CPython 再次完成上述 5 次原样 demo 检查，修改的三个
运行文件与源文件逐字节一致。Workflow 清单含 5,360 项，两种 CPython 启动验证通过。
缓存方案没有新增设置或改变 Manifest，独立 Skill 的参考资料已同步说明自动缓存行为。

当前有效候选（均在 `build/extension-external-cache/`，未安装）：

- Inno：`setup/Clackly-Setup-0.1.5-win-x64.exe`，28,964,414 bytes；
  SHA-256 `bab283d1bfac9a166588bdd43982a9fd9113acb5bd5b8058e5f950c367319267`。
- Workflow：`workflow/Clackly-Workflow-0.1.5-win-x64.zip`，32,620,931 bytes；
  SHA-256 `89946818b3273fd622c47589c78086f3ed44abfb24fc42505ef259885f47a9ee`。
- `publishable=false`、`source.dirty=true`；未提交、Push 或发布 Release。

实现、安装说明、测试证据及限制已回写
[#3 最新交付记录](https://github.com/Wutpeach/Clackly/issues/3#issuecomment-6649246839)。
Issue 保持 OPEN、待用户验收；安装仍等待用户授权。
