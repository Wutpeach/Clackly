---
title: "获取与安装 Developer Skill"
description: "从 Clackly 获取完整 Skill，安装到你使用的 Agent。"
---

## 推荐：从 Clackly Settings 获取

v0.1.6 随应用提供完整的 **Clackly Developer Skill**。

1. 打开 **Settings → 扩展**，找到 Clackly Developer Skill。
2. 点击 **复制 Agent 安装提示词**，粘贴给你使用的本地 Agent。
3. Agent 先识别当前客户端支持的 Skill 安装方法，读取真实随包目录，导入完整文件夹并验证能否识别。
4. 如已有同名 Skill，先比较差异；覆盖前需要你的明确同意。按客户端要求新开会话。

应用升级只更新随包源，Agent 中的副本需按上述步骤重新导入。Clackly 不修改 Agent 配置。

<figure class="docs-shot">
  <a href="/Clackly/images/docs/developer-skill-zh.webp"><img src="/Clackly/images/docs/developer-skill-zh.webp" alt="Settings 扩展页的 Developer Skill 区域，包含复制 Agent 安装提示词和打开 Skill 文件夹" width="1064" height="254" loading="lazy" /></a>
  <figcaption>隔离 Electron 中 Settings → 扩展的真实 Skill 获取入口，仅裁切相关区域。点击查看原图。</figcaption>
</figure>

## 云端或沙箱 Agent

本机路径无法访问时，用 **打开 Skill 文件夹** 提供完整目录/ZIP，或让 Agent 从 [llms.txt](/Clackly/llms.txt) 读取原文。网页资料可直接查阅，无需假定云端已安装本机副本。

也可从 [v0.1.6 源码归档](https://github.com/Wutpeach/Clackly/archive/refs/tags/v0.1.6.zip) 提取 **skills/clackly-developer/**，无需构建应用。保留 SKILL.md、references、examples 和 scripts 全部内容；旧文件中的开发期状态请对照[实际发行记录](/Clackly/docs/releases/)。

Cindy 项目 Skill 可放在 **你的工具工作目录/.agents/skills/clackly-developer/**，再新开会话。其他客户端使用其文档支持的目录/导入流程，不猜测通用安装路径。没有 Skill 加载器时，可明确要求 Agent 读取完整目录中的 SKILL.md。

[英文入口原文](/Clackly/agent/clackly-developer/README.md) · [中文入口原文](/Clackly/agent/clackly-developer/README.zh-CN.md) · [Skill 原文](/Clackly/agent/clackly-developer/SKILL.md)
