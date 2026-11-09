---
title: "Build with AI：从需求到扩展"
description: "Build with AI：从需求到扩展 · Clackly v0.1.6 Developer Skill"
---

不必先学习 Clackly 源码。描述你想完成的 Resolve 工作，让 Agent 借助 **官方 Developer Skill** 读取协议、选择示例、编写 Python，再交付可安装的 .clackly 和可编辑源码。

## 一条清楚的交付路径

1. [安装 Developer Skill](/Clackly/docs/developer/skill/) 到你使用的 Agent。它与安装给 Clackly 的扩展包不同。
2. [复制一个任务提示词](/Clackly/docs/developer/prompts/)，补上业务需求、读取/写入范围和所用 Host 版本。
3. Agent 核对 Host 能力，读取相关协议与完整示例，先做离线验证，再用官方打包工具输出。
4. 你检查源码与验证结果，从 Settings 导入包，在明确授权的本地测试项目中验证真实 Resolve 行为。

## 先选最小合适形态

| 需求 | 形态 | 官方参考 |
| --- | --- | --- |
| 一次读取/执行 | Python Command | [Manifest 与生命周期](/Clackly/docs/developer/reference/extension-v1/) |
| 一次填写、确认与结果 | Command UI | [Command UI](/Clackly/docs/developer/reference/command-ui/) |
| 从当前项目获取候选项 | Dynamic Prepare | [Prepare](/Clackly/docs/developer/reference/prepare/) |
| 持续浏览、详情与动作 | Extension View | [Views](/Clackly/docs/developer/reference/views/) |
| Create/Edit、多选批量 | View Form / Batch | 同一 Views 协议及 Timeline Manager |

## 规范只有一个权威来源

协议、示例和打包器维护在 **skills/clackly-developer/**。本网站的参考页在构建时从该目录生成，原始文件按字节复制并核对 SHA-256。不要修改生成页来发明第二套协议。

云端 Agent 可以从 [llms.txt](/Clackly/llms.txt) 发现完整原始资料；网页提供 **Copy for Agent** 和 Markdown 原文入口。没有本机文件权限的 Agent 不能假装已经安装 Skill。

v0.1.6 已发行 Command UI、Prepare、Views、Forms 和 Batch；仍要检查实际安装的 Host。Clackly 扩展是 **无沙箱的本地 Python**，不是任意 Web UI、常驻服务或依赖安装平台。写入前重查稳定身份；离线测试不等于真实 Resolve 兼容性验收。

[选择示例](/Clackly/docs/developer/examples/) · [验证与打包](/Clackly/docs/developer/verify/)
