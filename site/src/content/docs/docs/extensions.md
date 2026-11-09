---
title: "安装与管理第三方扩展"
description: "导入可信的 .clackly 包，配置命令并管理扩展版本。"
---

**只安装可信的 .clackly 包。** 扩展以当前用户权限运行本地 Python，没有沙箱；来源由作者声明，未经签名认证。

## 安装

1. 获取扩展作者提供的 .clackly 文件和用途说明。
2. 打开 **Settings → 扩展 → 安装**，选择文件。
3. 检查包身份、版本、来源和风险提示，确认导入。
4. 补齐必填设置并保存，确认扩展已启用且可运行。
5. 回到 Launcher 查找扩展命令，核对来源后执行。命令无需重启即可刷新。

若提示缺少宿主或依赖，先按提示修复，再运行命令。

<figure class="docs-shot">
  <a href="/Clackly/images/docs/extensions-zh.webp"><img src="/Clackly/images/docs/extensions-zh.webp" alt="运行摘要扩展详情：版本、声明来源、停用与卸载按钮、摘要前缀配置及命令列表" width="1520" height="1120" loading="lazy" /></a>
</figure>

## 更新与替换

点击扩展列表中的条目，查看版本、来源、配置与命令，并使用停用或卸载操作。

再次安装同一扩展时，界面会按版本提示**替换、更新或降级**，确认后才生效。源码有变化时重新打包导入，不要直接修改已安装文件。

**停用**保留文件和设置，命令不可执行；**卸载**默认保留设置，也可选择删除设置。包替换、停用、卸载和配置变化可能关闭相关 View 并使旧会话失效，先保存正在编辑的内容。

普通脚本见 [Launcher 与搜索](/Clackly/docs/launcher/)。制作扩展所需的 [Developer Skill](/Clackly/docs/developer/skill/) 安装给 Agent，.clackly 包安装给 Clackly。
