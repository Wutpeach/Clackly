---
title: "第一次呼出与执行"
description: "在 Resolve 加载插件，呼出面板并运行第一个命令。"
---

## 呼出面板

先从 Resolve 的 **Workspace → Workflow Integrations → Clackly** 加载插件，再按 **Ctrl + Space**。面板默认隐藏，呼出后出现在鼠标附近，遇到屏幕边缘会限制在工作区内。

## 选择一个操作

<figure class="docs-shot docs-shot-palette">
  <a href="/Clackly/images/docs/launcher-zh.webp"><img src="/Clackly/images/docs/launcher-zh.webp" alt="Clackly Launcher：已固定的添加标记、最近执行的运行摘要和命令分组" width="480" height="640" loading="lazy" /></a>
  <figcaption>隔离 Electron 实拍：官方示例运行后进入 Recent；未连接 Resolve，内置命令显示不可用。点击查看原图。</figcaption>
</figure>

1. 输入命令名称，例如 **Add Marker / 添加标记**。
2. 用上下方向键选择，按 **Enter** 执行。执行前确认当前项目、时间线与目标正确。
3. 按 **Escape** 从搜索回到 Launcher；再按一次隐藏面板。

添加标记会修改时间线。初次尝试请使用可丢弃的本地测试项目；也可以先浏览命令、Settings 或只读扩展。

## 看清命令的行为

选中命令后，点击 **Info**，或在命令列表聚焦时按 **Tab**，查看说明和鼠标操作映射。带修饰键的操作以此处显示为准。列表中的数字用于 Launcher 快速选择。

接下来了解 [Pinned / Recent / 搜索](/Clackly/docs/launcher/)，或从 [Settings](/Clackly/docs/settings/) 配置所需依赖。
