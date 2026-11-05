# Extension Package V1

.clackly 是 ZIP 文件，根目录必须包含 UTF-8 manifest.json。一个包对应一个 Extension，可包含多个 Python Command。最小示例见 ../examples/extensions/inspect-project/；独立的 [Developer Skill](../../skills/clackly-developer/README.zh-CN.md) 提供给外部 AI Agent 的开发指导、打包工具及安装说明，本协议文档仍以实际安装器和 Runner 为准。

    {
      "schemaVersion": 1,
      "id": "example.tools",
      "name": "Example Tools",
      "version": "1.0.0",
      "description": "My Resolve commands",
      "source": "Author or source (unverified)",
      "commands": [
        { "id": "inspect", "name": "Inspect project", "entry": "inspect.py", "keywords": ["project"] }
      ],
      "configSchema": {
        "label": { "type": "string", "label": "Label", "required": true }
      }
    }

ID 使用小写字母开头，以字母、数字、点或短横线组成，最多 80 字符；constructor、prototype 保留。Extension ID 与包内 Command ID 独立稳定，名称变更不改变身份。全局命令 ID 为 extension:<extension-id>/<command-id>，与内置及普通 Resolve Scripts 的 ID 空间分开。版本使用规范 SemVer（包括可选预发行标记）；同 ID 的 SemVer 优先级相同则 Replace，更高为 Update，更低为 Downgrade。每次导入均须确认，降级明确标识。

配置复用现有 configSchema，支持 string、number、boolean、color、path、folder、select；select 需要非空字符串 options。字段支持 label、required，不运行自定义控件或校验代码。保存时须满足必填字段。更新按字段名称、类型及当前可选值投影兼容配置；旧值留存于状态文档，未知/不兼容值不进入脚本，新增必填字段提示 Needs Setup。重新保存以当前配置替换旧值。禁用保留文件/配置；卸载默认保留配置，可勾选一并删除。

Python 入口导出同步或异步 execute(context)，结果须能序列化为 JSON。context 复用现有 Runner：command_id、长期配置字典 config、单次参数字典 input、logger.info/warning/error/debug，以及懒加载的 resolve、project、timeline。Resolve API 访问走既有 resolve/adapter.py；project/timeline 属性需要相应宿主上下文。资源可通过 Path(__file__).parent 定位。不自动安装依赖或运行安装钩子。第三方代码拥有当前用户权限，**不是沙箱**。

执行复用受管 CPython、Resolve API 兼容性 Probe 和短生命周期 RuntimeLauncher；无 PATH 解释器搜索，无开始执行后的 Runtime 回退。沿用现有单次 10 秒、stdout/stderr 各 1 MiB 上限。已安装仅表示包管理状态，执行仍需 Resolve 正在运行且 Scripting API 可用。脚本报错、Probe 不通过、超时都反馈失败。

Python 字节码缓存通过显式 pycache_prefix 重定向到 extensions/cache/python/<id>/<revision>/，不写入包目录、不放宽文件清单校验。同一 revision 可跨执行/重开复用，CPython 自行区分解释器缓存格式；缓存缺失会重建。Replace/Update 使用新 revision，提交后尽力清理旧缓存；卸载尽力清理当前 revision 缓存，禁用保留。缓存不进入 state 或包 Manifest，扩展无需声明或管理。

包限制：最大压缩包/总解压 32 MiB、单文件 8 MiB、512 个条目、Manifest 128 KiB、100 个 Command、50 个配置字段。路径使用相对 /，拒绝穿越、绝对路径、Windows ADS/设备名、链接/特殊文件、加密、大小写碰撞和文件/目录冲突；验证解压长度和 CRC。入口区分大小写，必须精确存在并以 .py 结尾。未知的 Manifest 顶层字段不参与执行。

默认目录为 %APPDATA%\Clackly\extensions\：packages/<id>/<revision>/ 存放不可变版本，state.json 保存活动版本指针、启用状态、Manifest、文件摘要和配置，staging/<token>/ 暂存确认候选。只有服务生成的路径可进入扩展执行入口；IPC 不接收脚本路径、Python 代码或自选安装位置。安装不写入应用目录或 Resolve Scripts，不创建链接。

先验证并冻结候选，确认后等待此扩展正在执行的任务结束，写入新版本目录，再以 fsync + 同目录 rename 提交单个状态文档。提交失败保留旧指针/配置；提交后清理失败不撤销成功。进程中断前后活动版本由完整状态文档决定；未被状态引用的残留目录不自动发现、注册或执行，仅占空间。短期跨进程写锁与旧状态比较避免覆写其他实例配置。如进程在写锁期间崩溃，保留 state.lock 并拒绝后续写入；确认所有 Clackly 实例退出后移除该锁再重开，不自动绕过锁。状态文件损坏时不覆盖原文件，内置功能继续可用，Extensions 页面报告恢复要求。

Settings → Extensions 在原 760×560 双栏内管理列表/详情、安装、更新、启停、卸载和配置。Catalog 继续使用现有搜索投影，变化后失效并通知 Palette，无需重启。商店和自动更新不属于 V1。

## #7-A Command UI（本工作区开发候选，未发布）

Command 可声明 `ui: {version: 1, inputs: {...}, confirm: {message: "..."}}`；输入和确认至少一项存在。Host 以独立可聚焦窗口完成单次输入、按需确认、Running 和 Result，不改变 Palette/D7 尺寸或 Settings 的长期配置。单次输入经 Host 类型与范围校验后通过 `context.input` 传入，绝不混入 `context.config` 或持久化。填表时间不消耗 Python 正式执行的 10 秒限额。提交固定原 revision，扩展在填表期间更新会拒绝执行并要求重开。

结果显式声明 `$clackly: "result", version: 1, status: "success" | "error", message`，可附纯文本、键值或列表；普通 JSON/日志不自动变为 UI。短成功消息关闭临时窗并轻通知；实质结果保留滚动与复制；失败/超时保留可诊断界面。完整字段、类型、边界及示例以自包含公开参考 [Command UI](../../skills/clackly-developer/references/command-ui.md) 为准；字段与结果只作为数据，无 DOM/HTML/JS 注入。

同一 Host 管理一个 Command 会话，重复触发只聚焦当前窗口；Running 不提供假取消，关闭不会中断或重复启动脚本。取消输入返回 Palette；结果关闭将焦点交回原生窗口系统。确认不代表代码隔离或权限授权。#7-B Prepare、动态选项、运行中 RPC、Lua/JS Runtime 本轮均未实现。旧 Host 不识别新字段，扩展作者必须确认目标 Host 支持，不能依赖旧版忽略字段来执行风险命令。

验证：node --test extensions/ExtensionManager.test.js extensions/registerIpc.test.js；node --test extensions/python.integration.js extensions/transaction.integration.js extensions/ui.integration.js。UI 集成使用真实 Core、文件系统与 Python，浏览器替代 Electron transport/文件选择器，不能代替真实 Workflow 菜单、native focus 和 Resolve 产品验收。未经授权不替换用户当前安装。

真实宿主的只读验证入口为 node scripts/extension-v1-resolve-smoke.js --read-only <受管 Runtime 暂存目录绝对路径>。该工具使用独立临时 appData 安装测试扩展，仅读取 Resolve 版本及是否打开项目，不改用户安装、配置、项目或时间线。阶段验证与待验收项见 extension-package-v1-validation.md。
