---
title: "常见问题与排错"
description: "按症状检查加载、快捷键、运行环境与扩展错误。"
---

## Workflow Integrations 菜单没有 Clackly

确认符合[兼容性范围](/Clackly/docs/#适用环境)，安装已完成，并已重新启动 Resolve。仍无菜单时，检查官方 Workflow Integration 组件；组件缺失按下文修复。

## 按 Ctrl + Space 没有面板

先从 **Workspace → Workflow Integrations → Clackly** 加载，再呼出。检查快捷键是否被其他应用占用；如果运行过开发版，退出旧 Clackly 进程后再加载插件，避免同时运行多份。

## 扩展已安装，但命令失败

检查扩展是否启用、必填设置是否保存、Resolve 与 Scripting API 是否可用。保留错误信息和扩展版本。若失败操作可能已写入，先检查数据，再决定是否重试。

## 缺少 WorkflowIntegration.node

修复官方 Resolve 的 SamplePlugin 组件，再运行 Clackly 安装器。不要从其他机器或不明网站复制此文件，也不要扩大整个共享目录的权限。

## 找不到普通脚本

用名称搜索，或从已固定/最近使用的条目进入；普通脚本不会直接填满默认 Commands 分组。确认脚本位于 Resolve/Clackly 实际识别的来源，扩展安装路径与普通 Scripts 目录不是一回事。

## AI 看不到 Skill

云端 Agent 可能无法访问本机路径。打开完整 Skill 文件夹，提供整个目录/ZIP，或让 Agent 读取本站 [llms.txt](/Clackly/llms.txt)。不能只复制 SKILL.md 而丢掉 references、examples 和打包工具。

## 兼容性、卸载与支持

兼容性见[文档首页](/Clackly/docs/#适用环境)，安装验证限制见[安装页](/Clackly/docs/install/)。删除扩展请使用 Settings 的卸载入口，不要手工删除受管包。

提交 [GitHub Issue](https://github.com/Wutpeach/Clackly/issues) 时附上 Clackly/Resolve/Windows 版本、扩展 ID/版本、触发步骤、实际错误和是否已改动数据。请移除项目机密、素材路径与个人资料。
