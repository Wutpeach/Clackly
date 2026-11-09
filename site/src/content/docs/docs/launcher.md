---
title: "Launcher、搜索与普通脚本"
description: "Clackly v0.1.6 使用指南：Launcher、搜索与普通脚本"
---

## 默认 Launcher

v0.1.6 的列表分为 **Pinned、Recent、Commands**，仅显示非空分组。固定命令优先，最近运行过的命令可从 Recent 找回，同一命令会去重。Pin 与 Recent 跨会话保存，覆盖内置命令、扩展命令和普通脚本。

选中命令后使用 Pin 控件固定或取消固定；操作后保持当前选择。Commands 中内置和扩展命令交错展示，默认列表不再全局截断为 9 条，超出窗口时滚动。上下方向键按屏幕显示顺序移动，选中项自动滚入可见区域。

## 搜索

输入名称或关键词，在 Results 中查看匹配。搜索按相关性优先，使用情况参与适用的排序；中英文名称及拼音搜索按当前注册元数据匹配。来源标签区分 **Clackly、扩展名称和脚本来源**，尤其要注意同名命令。

**Escape** 回到 Launcher。卸载扩展后命令会刷新，并修正无效选择。

## 普通 Resolve Scripts

普通 Resolve Python/Lua 脚本和 **.clackly 扩展包** 是不同入口。普通脚本从 Pin、Recent 或搜索发现，不自动加入普通 Commands 的默认扩展命令列表。脚本可用性取决于本机脚本来源、Resolve 与运行环境；不要把 Lua 普通脚本理解成 Lua 扩展 Runtime。

需要结构化配置、输入或 View 的工具，使用[扩展](/Clackly/docs/extensions/)；需要自己制作时进入 [Build with AI](/Clackly/docs/developer/)。
