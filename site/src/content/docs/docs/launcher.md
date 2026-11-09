---
title: "Launcher、搜索与普通脚本"
description: "固定常用命令、找回最近使用的操作，或按名称搜索。"
---

## 默认 Launcher

列表分为 **Pinned（固定）、Recent（最近）、Commands（命令）**，空分组不显示，同一命令不重复列出。Pin 与 Recent 跨会话保存，支持内置命令、扩展命令和普通脚本。

选中命令后点击 **Pin** 固定或取消固定；执行过的命令可从 Recent 找回。Commands 交错展示内置与扩展命令，超出窗口时滚动。用上下方向键选择，按 Enter 执行。

## 搜索

输入名称或关键词，在 Results 中查看匹配；支持中英文和拼音，具体取决于命令提供的名称与关键词。相关性优先，使用记录也会影响排序。执行前核对来源标签：**Clackly、扩展名称或脚本来源**，避免选错同名命令。

按 **Escape** 回到 Launcher。

<figure class="docs-shot docs-shot-palette">
  <a href="/Clackly/images/docs/search-zh.webp"><img src="/Clackly/images/docs/search-zh.webp" alt="搜索“摘要”找到生成运行摘要，来源显示 Extension · 运行摘要" width="480" height="640" loading="lazy" /></a>
  <figcaption>隔离 Electron 实拍：搜索已安装的官方运行摘要示例，来源显示在命令名下方；未连接 Resolve。点击查看原图。</figcaption>
</figure>

## 普通 Resolve Scripts

普通 Resolve Python/Lua 脚本通过**搜索、Pinned 或 Recent** 访问，不会自动列入默认 Commands 分组。可用性取决于脚本位置、Resolve 和本机运行环境；支持普通 Lua 脚本不表示支持 Lua 扩展包。

需要结构化配置、输入或 View 的工具，使用[扩展](/Clackly/docs/extensions/)；需要自己制作时进入 [Build with AI](/Clackly/docs/developer/)。
