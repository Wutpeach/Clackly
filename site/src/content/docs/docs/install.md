---
title: "下载与 Windows 安装"
description: "Clackly v0.1.6 使用指南：下载与 Windows 安装"
---

从 [v0.1.6 官方 Release](https://github.com/Wutpeach/Clackly/releases/tag/v0.1.6) 下载 **Clackly-Setup-0.1.6-win-x64.exe**。这是用户安装入口，无需克隆源码、安装 Node 或自行构建应用。

## 安装前

准备 Windows x64、已安装的 DaVinci Resolve Studio 和其官方 Workflow Integration / Scripting 组件。先保存工作，按安装器提示自行关闭 Resolve。安装过程可能请求 UAC 提权；不要为了安装收紧整个 Resolve 共享目录的权限。

安装器未签名，Windows 可能显示 SmartScreen 或“未知发布者”。核对官方仓库、文件名、大小和 SHA-256，再自行判断是否继续。无需关闭 Windows 安全功能。

~~~powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Clackly-Setup-0.1.6-win-x64.exe
~~~

v0.1.6 EXE：**28,965,825 字节**；SHA-256：

~~~text
00d1400b8e67678d6e67c51da065c30ca2a4884478e32d7fa3269da8b9b4fb25
~~~

## 完成安装

1. 运行 EXE，阅读提示并完成安装。正常覆盖升级保留配置和偏好。
2. 自行重新启动 Resolve Studio。
3. 打开 **Workspace → Workflow Integrations → Clackly**。菜单加载不等于每次启动 Resolve 都静默自动运行。
4. 按 **Ctrl + Space**，进入[首次使用](/Clackly/docs/first-use/)。

安装器内含应用、renderer 和受管 Python Runtime。**WorkflowIntegration.node 不随包分发**，只从本机官方 Resolve SamplePlugin 验证并复制。若该组件缺失或不匹配，请修复官方 Resolve 安装，不要从不明来源下载 native 文件。

固定安装位置位于：

~~~text
%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly
~~~

断网安装、标准用户 UAC 与完整卸载尚未专项实测；Release 发表和本机安装验收是不同事实。遇到问题见[排错](/Clackly/docs/troubleshooting/)。
