---
title: "Command UI 与 Extension Views"
description: "Clackly v0.1.6 使用指南：Command UI 与 Extension Views"
---

v0.1.6 已发行下列扩展界面能力。它们由 Clackly Host 渲染，扩展提供声明和数据，不是任意网页或自定义前端。

## 一次执行：Command UI

命令可在执行前显示输入表单和确认信息。输入只用于本次操作，不等于持久设置。取消表单不会启动执行；提交后会显示运行状态、简短成功提示或可查看/复制的结果与错误。

**Dynamic Prepare** 在表单打开/刷新时读取实时选项或默认值。刷新可能移除过期选择，并重置确认；必选项没有可用候选时不能执行。Prepare 不会动态创建新字段，也不是持续运行的后台连接。

## 持续浏览：Extension Views

View 是独立的普通工具窗口，支持列表、搜索、标签筛选、详情和动作。每个扩展每个 Host 最多一个窗口，重新打开会聚焦现有会话。**Ctrl + .** 在当前 View 中打开 ActionPanel；方向键与 Enter 操作列表/动作，Escape 按层关闭菜单、确认或返回，上层根页面保持打开。

Create/Edit Form 使用同一窗口。未保存更改会提示继续编辑或放弃；草稿只在当前会话存在。多选是扩展显式启用的能力，批量结果可显示成功、失败与每个失败目标的原因。

支持选择性的重新聚焦刷新；表单不会因聚焦而刷新。列表和详情是快照，切换项目或删除对象后应重新读取，不能假设旧选择仍有效。

## 失败后先检查数据

关闭窗口或超时不等于取消代码，也不会撤销已经发生的写入。失败后先检查目标，再决定是否重试。Host 不提供事务、自动回滚或 Undo。

想制作这些工具，先看 [Agent 提示词](/Clackly/docs/developer/prompts/) 和 [Views 官方协议](/Clackly/docs/developer/reference/views/)。
