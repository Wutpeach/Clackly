# Issue #7-B Dynamic Prepare 开发验证

2026-11-06。以 Issue #7 最新批准指令 6676191472 为范围，基于已验收的 #7-A 实现；本文件记录开发证据，不表示用户产品验收。

## 交付

- Command UI v2 的显式 prepare:true；固定动态 select、label/value 分离及受约束 defaults。旧 v1 静态 UI 保持兼容，#7-A Host 拒绝未知 v2；示例还在 Python 侧拒绝缺少 phase/input 的旧 Host。
- 相同入口的 prepare(context) 与 execute(context) 各使用短生命周期 worker，分别限时10秒，填表不保活。复用受管 Runtime、revision 完整性、Resolve context 和包外缓存。
- 现有 Command Dialog 增加 Loading/Ready/Empty/Failed/Timeout、退出等待、重试和主动刷新。保留合法编辑，失效选择清空并提示，确认重置。可选空列表可显示 Empty，但仅必填无候选时阻止执行。
- Host 持有一次性候选 token，绑定命令/revision/配置；配置变化、Replace/禁用/卸载、另一 Host 写盘会拒绝旧数据。迟到响应不能打开或覆盖新会话。Execute 重新核对真实项目和时间线稳定ID，不静默换目标。
- 公开协议：skills/clackly-developer/references/prepare.md。公开示例：examples/timeline-summary；只读，不更改 Resolve 项目。第三方 Python 仍无 OS 沙箱。

## 已执行的验证

- Node 全组486/486（build/issue7b-node.log）；随后补充跨Host状态校验与空列表语义，最终仅重测 Extensions 相关26/26（build/issue7b-extension-final.log），未重复全组。
- Python 五组87项通过（build/issue7b-python.log）；公开示例另5项离线测试通过，已归入 scripts/test_prepare_example.py。
- Prepare 协议/会话与真实 Python 专项12/12通过，包含独立 PID、真实10秒超时、业务异常、非法返回和恢复。最终新增状态校验已由上述26项覆盖。
- 真实隔离Electron完整Prepare流程1/1通过（build/issue7b-ui.log），使用真实Core、包安装、preload/IPC、Python、窗口与剪贴板。Resolve API由独立fixture提供，未连接真实Resolve。覆盖默认当前时间线、同名标签、Tab/Enter/Escape、退出Loading、刷新保留标题、删除候选清空、业务目标消失/项目切换、无项目/空项目、失败/超时重试、配置失效阻止Execute、中英与320px布局。
- UI截图与原生focus/topmost回执位于 build/issue7b/electron/，renderer errors=[]。已直接查看Ready、中文窄窗口及失败截图。Impeccable沿用当前DESIGN/Settings authority，机械检查返回[]（build/issue7b-impeccable.json）。未重建窗口系统。
- 全新作者Agent仅凭公开Skill/协议生成可安装的时间线摘要扩展；离线5项通过，产物随后作为公开示例在隔离Electron实际安装运行。修正其发现的旧参考文档仍称“不支持Prepare”的矛盾。
- 最终 npm run build 通过（build/issue7b-build-final.log），保留既有bundle大小提示；git diff --check通过。

初期UI夹具错误把Electron模块参数当成模拟项目，表现为空列表，修正测试传参后完整流程通过；保留 build/issue7b-ui-diagnostic.log，不把它归为产品默认值故障。更广串行集成在用户纠正测试粒度后中止（build/issue7b-integration.log），已完成的前17项通过，包含原#7-A真实Electron和#7-B场景；没有整组完成结果，不记为全绿。后续复用已过UI证据，仅对最终数据边界改动做窄范围验证，未继续唤醒可见窗口。

## 部署与产品验收

使用现有 npm run workflow:deploy:dev，要求main干净已提交、Resolve/Clackly退出，并保留完整Inno/Runtime/Native验证、备份、回滚及配置/相邻插件不变核对。实际来源SHA、构建产物hash、安装回执与回滚会话在Issue交付评论中记录；本文件不预写部署成功。

真实Resolve中多时间线/删除/切换、Scripting API耗时、原生窗口焦点/遮挡、系统选择器及用户产品体验由用户自行验收。示例项目超过100条时间线或无法取得稳定ID时明确失败。未实现动态字段/条件联动、轮询、持续RPC、后台任务、实时进度、执行中取消、多语言Runtime或#8；不Push、不发布Release，不关闭Issue7。
