---
title: "常见问题与排错"
description: "Clackly v0.1.6 使用指南：常见问题与排错"
---

## Workflow Integrations 菜单没有 Clackly

确认使用的是 Windows x64 Resolve Studio，安装器已成功完成，且安装后已经重新启动 Resolve。检查官方 Workflow Integration 组件是否存在。菜单未注册与面板内命令执行失败是两条不同路径，反馈时说明卡在哪一步。

## 按 Ctrl + Space 没有面板

先从 **Workspace → Workflow Integrations → Clackly** 加载，再呼出。关闭旧的 Clackly 开发进程，检查快捷键是否被其他应用占用。不要为了排查启动多份宿主或修改生产项目。

## 扩展已安装，但命令失败

检查扩展是否启用、必填设置是否保存、Resolve 是否运行且 Scripting API 可用。运行时兼容检查和安装完整性校验独立；安装成功不保证可执行。保留错误信息和扩展版本。涉及写入时，先查看数据实际状态，避免盲目重试。

## 缺少 WorkflowIntegration.node

从官方 Resolve 安装修复 SamplePlugin 组件，再重新运行 Clackly 安装器。Clackly 不随包分发该 native 文件，不从其他机器或不明网站复制它。不要为了通过安装而扩大整个共享目录的权限。

## 找不到普通脚本

用名称搜索，或从已固定/最近使用的条目进入；普通脚本不会直接填满默认 Commands 分组。确认脚本位于 Resolve/Clackly 实际识别的来源，扩展安装路径与普通 Scripts 目录不是一回事。

## AI 看不到 Skill

云端 Agent 可能无法访问本机路径。打开完整 Skill 文件夹，提供整个目录/ZIP，或让 Agent 读取本站 [llms.txt](/Clackly/llms.txt)。不能只复制 SKILL.md 而丢掉 references、examples 和打包工具。

## 兼容性、卸载与支持

公开目标是 Windows + Resolve Studio；macOS、Linux、免费版及任意版本兼容性均不作承诺。完整卸载尚未专项实测。删除扩展请使用 Settings 的卸载入口，不要手工删除受管包。

提交 [GitHub Issue](https://github.com/Wutpeach/Clackly/issues) 时附上 Clackly/Resolve/Windows 版本、扩展 ID/版本、触发步骤、实际错误和是否已改动数据。请移除项目机密、素材路径与个人资料。
