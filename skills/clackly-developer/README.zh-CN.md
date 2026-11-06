# 安装与使用 Clackly Developer

这个 Skill 安装给 **AI Agent**；Agent 生成的 `.clackly` 安装给 **Clackly**。
实际使用扩展需要已支持 Extension V1 的 Clackly，以及可用的 Resolve Scripting API。
仅开发和打包时，准备 Python 3 即可，无需运行 Clackly 源码。

## 从 Clackly Settings 安装

使用包含此 Skill 的 Clackly 构建，进入 **Settings → 扩展**，找到
**Clackly Developer Skill**，点击 **复制 Agent 安装提示词**，粘贴给本地 AI Agent。
提示词包含随包目录的实际路径；Agent 会识别自身 Harness 的安装方式、导入完整目录
并验证识别情况。同名副本先比较，覆盖前需要你的明确同意；按客户端要求新开会话。

Clackly 不修改 Agent 配置。应用升级只更新随包源目录，已导入的副本不会自动同步；
需要更新时重新复制提示词。云端或沙箱 Agent 可能看不到本机文件，可以点击
**打开 Skill 文件夹**，手动提供完整目录或 ZIP。资源缺失或不可读时按钮不可用，
请检查权限或重新安装包含 Skill 的构建，然后重新打开扩展页。

此入口属于当前开发构建，不代表已有公开 Release 包含它。文档中的 #7 静态 Command UI /
Dynamic Prepare，以及 #8 List / Detail / Form / Create / Edit / 多选 / Batch Action
已在当前 Host 验收；交付前仍需核对目标 Host 支持。用法与完整示例见
[Command UI](references/command-ui.md)、[Prepare](references/prepare.md) 和
[Views](references/views.md)。

## 单独获取与加载（备用）

在 GitHub 仓库选择 **Code → Download ZIP**，解压后只保留
`skills/clackly-developer/` 文件夹。不要求 Git clone 或构建整个项目。
如果直接取得这个文件夹的独立副本，也能使用；请将 `SKILL.md` 与其参考资料、
示例、脚本一起保留，不要只复制入口文档。

将文件夹放入你的 Agent 客户端支持的 Skill 目录，或使用其本地 Skill 导入功能。
Cindy 的项目 Skill 可放在
`<你的工具工作目录>/.agents/skills/clackly-developer/`，随后新开或重启 Agent
会话加载。其他客户端按其说明选择 Skill 目录或导入入口；本包采用标准
`SKILL.md` 格式，不依赖专属平台 API。客户端没有 Skill 加载器时，也可以明确
让 Agent 读取 `clackly-developer/SKILL.md` 并使用文档链接的本地资料。

## 在全新对话中使用

让 Agent 能访问这个文件夹，不提供 Clackly 源码或额外协议背景。例如：

> 使用 clackly-developer，帮我做一个只读的 Resolve 项目检查工具，允许在
> Clackly 中设置日志标签。请交付源码和可安装的 .clackly。真实 Resolve 测试由我自己完成。

Agent 使用 Python 3 运行自带的打包工具。也可以在 Skill 文件夹下自行打包原样示例：

```text
python scripts/package_extension.py examples/inspect-project output/inspect-project-1.0.0.clackly
```

Windows 可使用 `py -3`，或已确认是 Python 3 的 `python`；macOS/Linux 通常用
`python3`。工具不覆盖已有产物，再次打包请换一个输出文件名。

进入 Clackly **Settings → Extensions → Install**，选择生成的 `.clackly`，
查看来源和风险提示并确认。填写 **Log label** 并保存，在 Palette 搜索
**Inspect Resolve Project** 后运行。Resolve 需要处于运行状态且 Scripting API
可用。这个示例只读取版本与是否打开项目，不要求当前时间线，不修改项目资料。
Agent 新生成的工具名称、说明与配置标签会按你的使用语言编写。

迭代同一个工具时，保留 Extension/Command ID 和兼容的配置字段名、类型。
重新导入同版本优先级的包会显示 **Replace**，更高版本显示 **Update**，兼容配置会保留。
不要直接修改已安装文件。第三方扩展以当前用户权限运行，没有沙箱；应检查源码，
实机操作按自己的授权范围进行。

离线语法、模拟上下文和打包测试不代表真实 Resolve 兼容性已验收。
最终验收请亲自新开对话，仅用自然语言提出真实工具需求，观察 Agent 能否交付，
再自行完成安装、配置、搜索与运行，也可尝试带配置工具和原 ID 迭代。
