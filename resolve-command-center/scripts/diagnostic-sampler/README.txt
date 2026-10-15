Clackly 故障诊断采样器（Windows）
===================================

用途
----
当 Clackly 的 Resolve → After Effects 导出发生故障时，此工具会在本机收集一次
复现期间的运行时、进程、缓存、日志和 Windows 崩溃事件证据，并生成一个可手工发送的
普通 ZIP。工具不会上传任何文件、不会结束 Resolve/Clackly/Python 进程，也不会收集
Resolve 项目、AE 工程、媒体或用户文档。

最少操作
--------
1. 完整解压 ZIP 到本机文件夹（路径可以包含中文和空格）。
2. 先关闭 DaVinci Resolve、Clackly Workflow 和相关 Python 进程。
3. 双击“Start-Clackly-Diagnostics.cmd”。如仍有残留进程，按窗口提示退出后重试；工具不会替您结束它们。
4. 默认选择普通采样。在“开始复现”提示后，启动 Resolve，执行一次 Clackly AE 导出，
   然后回到采样窗口按 Enter。
5. 将显示的普通 ZIP 发给支持人员；发送前请自行检查内容。

隐私和可选 dump
---------------
普通包会将常见的用户名、用户目录和计算机名替换为占位符，并只复制允许列表中的
Clackly 日志（最多各 5 MiB）。进程命令行、日志和崩溃事件仍可能包含项目名称或路径，
请在发送前复核。

复现结束后，manifest.json 会记录观察到的 Resolve.exe 实际安装目录，以及该目录的
Resolve.exe、fusionscript.dll 和对应 DaVinciResolveScript.py 的文件状态与 SHA-256。
多个安装目录会明确标为 ambiguous；未观察到或无法读取进程路径会标为 unresolved。
默认 C 盘目录不存在不代表 Resolve 未安装，文件存在也不代表 Runtime Probe 已通过。
普通包只提取 resolve-installation.json 和 runtime-diagnostic.json 中允许的路径、
文件大小/时间、错误码/阶段/时间等字段（单个源记录最多 64 KiB），并对路径脱敏；
不会复制完整配置、JSX、项目或媒体内容。新路径记录只读取，不会移走或修改。

可选 mini dump 默认关闭。只有您明确选择后才会请求一次管理员权限，并且只会临时配置
Windows Error Reporting 的 python.exe LocalDumps 项。dump 可能包含进程内存中的敏感
内容，因此会单独生成名称含 DUMPS-SENSITIVE 的 ZIP，绝不会进入普通包。拒绝 UAC 或
配置失败时，普通采样会继续进行。
授权拒绝或启动失败的原因会显示在窗口并写入 manifest.json。采样完成后，窗口也会列出
采集失败、缺失或跳过的项目；缺失 Python 观察记录会明确说明短暂进程可能被轮询遗漏。

恢复说明
--------
为了强制一次真实 Runtime Probe，工具会先保存并暂时移走
%APPDATA%\Clackly\runtime-probe.json，结束时恢复原来的状态。如果 Windows 被强制
关机或 PowerShell 被强制结束，下一次启动会先尝试根据
%LOCALAPPDATA%\ClacklyDiagnostics\recovery.json 恢复；不要手动删除该 recovery 文件
或同目录下带 clackly-diagnostic-quarantine 的文件，先联系支持人员。
若恢复未完成，或新缓存证据未能保存，工具会返回失败并保留需要人工处理的文件。
跨次恢复遇到无法确认归属的新缓存时不会删除它。请保留原始采样目录及 recovery.json；
即使已经生成普通 ZIP，也不代表缓存和注册表已经恢复成功。

此工具需要 Windows PowerShell 5.1 和 Windows 自带组件；不需要 Node.js、Python、
Sysinternals、第三方 PowerShell 模块或网络连接。
