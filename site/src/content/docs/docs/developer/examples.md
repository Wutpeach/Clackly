---
title: "从官方完整示例开始"
description: "从官方完整示例开始 · Clackly v0.1.6 Developer Skill"
---

示例与打包器均来自 Developer Skill，本站只导出源文件，不维护另一份示例。复制到你自己的干净源码目录，修改为唯一 Extension ID 后再开发；不要把无关工具继续命名为示例 ID。

| 示例 | 用途 | 完整源码 |
| --- | --- | --- |
| Project Inspector | 无项目也能处理的只读检查 | [Manifest](/Clackly/agent/clackly-developer/examples/inspect-project/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/inspect-project/inspect.py) |
| Run Summary | 静态输入、确认、结构化结果 | [Manifest](/Clackly/agent/clackly-developer/examples/run-summary/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/run-summary/summary.py) |
| Timeline Summary | 动态 Prepare 选项与默认值 | [Manifest](/Clackly/agent/clackly-developer/examples/timeline-summary/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/timeline-summary/report.py) |
| Marker Browser | 只读 List/Detail、搜索与动作 | [Manifest](/Clackly/agent/clackly-developer/examples/marker-browser/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/marker-browser/markers.py) |
| Timeline Manager | Create/Edit、批量与重新聚焦刷新 | [说明](/Clackly/agent/clackly-developer/examples/timeline-manager/README.md) / [Manifest](/Clackly/agent/clackly-developer/examples/timeline-manager/manifest.json) / [Python](/Clackly/agent/clackly-developer/examples/timeline-manager/timelines.py) |

Marker Browser 的标记身份是项目/时间线 ID、帧与内容指纹的组合，无法区分同帧相同内容的删除重建，**不能用于写入**。Timeline Manager 使用原生项目/时间线稳定 ID 和名称快照，写入前重查；只在明确可丢弃的本地测试项目中手测，不使用网络项目库或生产资料。

[协议](/Clackly/docs/developer/reference/extension-v1/) 提供 context、10 秒执行限制、受管运行时和包只读等边界。示例中的 Resolve 方法需对照你本机的 Blackmagic Scripting API 文档；Skill 不是完整的 Resolve API 手册。
