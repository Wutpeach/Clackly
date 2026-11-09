---
title: "Build with AI：从需求到扩展"
description: "描述 Resolve 需求，让 Agent 基于官方 Skill 交付可安装扩展。"
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

协议、示例和打包器以 **skills/clackly-developer/** 为准。本站参考页由它生成，Markdown 原文与源码逐字节保持一致。

云端 Agent 可从 [llms.txt](/Clackly/llms.txt) 获取全部原始资料，网页也提供 **Copy for Agent** 和 Markdown 原文入口。读取网页与在 Agent 中安装 Skill 是两种使用方式。

这些界面能力已随 v0.1.6 发行；开始前请核对实际安装的 Clackly 版本。扩展运行**无沙箱的本地 Python**，不支持任意网页、常驻服务或自动安装依赖。写入身份、超时与真实宿主测试要求见[验证与打包](/Clackly/docs/developer/verify/)。

[选择示例](/Clackly/docs/developer/examples/) · [验证与打包](/Clackly/docs/developer/verify/)
