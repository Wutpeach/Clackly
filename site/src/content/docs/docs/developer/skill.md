---
title: "获取与安装 Developer Skill"
description: "获取与安装 Developer Skill · Clackly v0.1.6 Developer Skill"
---

## 推荐：从 Clackly Settings 获取

v0.1.6 随应用提供完整的 **Clackly Developer Skill**。

1. 打开 **Settings → 扩展**，找到 Clackly Developer Skill。
2. 点击 **复制 Agent 安装提示词**，粘贴给你使用的本地 Agent。
3. Agent 先识别当前客户端支持的 Skill 安装方法，读取真实随包目录，导入完整文件夹并验证能否识别。
4. 如已有同名 Skill，先比较差异；覆盖前需要你的明确同意。按客户端要求新开会话。

Clackly 不替你修改 Agent 配置。应用升级只更新随包源，已导入副本不会自动同步；需要更新时重新复制提示词。

## 云端或沙箱 Agent

复制的本机路径不一定可访问。用 **打开 Skill 文件夹** 提供完整目录/ZIP，或让 Agent 先读本站的 [llms.txt](/Clackly/llms.txt) 与链接原文。网页原文可用于查阅，不代表云端已经安装本机 Skill。

独立获取时，可从 [v0.1.6 源码归档](https://github.com/Wutpeach/Clackly/archive/refs/tags/v0.1.6.zip) 解压 **skills/clackly-developer/**，无需构建 Clackly。保留 SKILL.md、references、examples 和 scripts 全部内容。本站会修正已发行状态的文档描述；旧归档中的开发期提示不覆盖真实 Release 状态。

Cindy 项目 Skill 可放在 **你的工具工作目录/.agents/skills/clackly-developer/**，再新开会话。其他客户端使用其文档支持的目录/导入流程，不猜测通用安装路径。没有 Skill 加载器时，可明确要求 Agent 读取完整目录中的 SKILL.md。

[英文入口原文](/Clackly/agent/clackly-developer/README.md) · [中文入口原文](/Clackly/agent/clackly-developer/README.zh-CN.md) · [Skill 原文](/Clackly/agent/clackly-developer/SKILL.md)
