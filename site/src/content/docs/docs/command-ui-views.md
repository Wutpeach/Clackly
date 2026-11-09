---
title: "Command UI 与 Extension Views"
description: "了解单次输入表单和持续浏览窗口的操作方式。"
---

扩展可以使用一次性输入表单，也可以打开持续浏览的工具窗口。界面由 Clackly 渲染，具体字段与动作由扩展决定。

## 一次执行：Command UI

命令可在执行前显示输入表单和确认信息。输入只用于本次操作，不等于持久设置。取消表单不会启动执行；提交后会显示运行状态、简短成功提示或可查看/复制的结果与错误。

使用 **Dynamic Prepare** 的表单会在打开或刷新时读取当前项目的选项。刷新后请重新核对选择与确认项；没有可用的必选项时不能执行。

<figure class="docs-shot docs-shot-command">
  <a href="/Clackly/images/docs/command-ui-zh.webp"><img src="/Clackly/images/docs/command-ui-zh.webp" alt="生成运行摘要的 Command UI：标题、备注、数字输入以及取消和运行命令按钮" width="960" height="1160" loading="lazy" /></a>
  <figcaption>隔离 Electron 实拍：官方运行摘要示例的静态表单，不读取或修改 Resolve 项目；下滚可见其余字段和确认项。点击查看原图。</figcaption>
</figure>

## 持续浏览：Extension Views

View 是独立工具窗口，可提供列表、搜索、筛选、详情和动作。重新打开同一扩展会回到已有窗口。

- **Ctrl + .**：打开当前 View 的动作面板。
- **方向键 / Enter**：选择并执行。
- **Escape**：关闭当前菜单、取消确认或返回上一级；在根页面不会关闭窗口。

扩展可在同一窗口提供创建/编辑表单，或启用多选批量操作。离开未保存表单时会提示确认；关闭会话后草稿不保留。批量结果可分别显示成功、失败及原因。

部分扩展在窗口重新获得焦点时刷新列表或详情；表单不会因此刷新。切换项目或删除对象后，重新读取数据再操作。

## 失败后先检查数据

关闭窗口或超时不等于取消代码，也不会撤销已经发生的写入。失败后先检查目标，再决定是否重试。Host 不提供事务、自动回滚或 Undo。

想制作这些工具，先看 [Agent 提示词](/Clackly/docs/developer/prompts/) 和 [Views 官方协议](/Clackly/docs/developer/reference/views/)。
