# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Clackly 面向 DaVinci Resolve 编辑人员。他们在剪辑过程中高频调用命令，希望主要通过键盘快速完成操作，而无需离开当前工作上下文去浏览菜单、寻找功能或记忆快捷键。

## Product Purpose

Clackly 是集成在 DaVinci Resolve 工作流中的桌面命令面板。它让用户呼出一个轻量浮层、搜索并执行编辑命令，然后立即回到素材和时间线。成功意味着常用操作更快完成，同时尽量不遮挡或打断 Resolve 工作区。

## Positioning

Clackly 的定位更接近 FX Console、Spotlight 和 Quicker：它是一个可高频呼出的、键盘优先的 Resolve 浮层工具，而不是需要用户切换注意力的独立应用窗口。

## Operating Context

- 产品运行在桌面版 Electron 中，并与 DaVinci Resolve 集成。
- 用户从 Resolve 工作区内高频呼出命令面板，以搜索和执行为主，不以鼠标浏览为主。
- 浮层应保持紧凑，避免大面积遮挡素材、检视器和时间线。
- Resolve Workflow Integration 是首选集成与生命周期路径；Python Utility 与独立 Electron 路径属于开发或兼容性后备方案。

## Capabilities and Constraints

- 命令以意图描述，并通过能力层和 Resolve 适配器执行，避免界面直接绑定具体执行后端。
- 当前仓库中的 MVP 已实现命令搜索、键盘选择与执行，以及添加时间线标记的能力。
- 核心交互必须完整支持键盘：呼出、搜索、选择、执行和退出。
- 产品必须保持“Resolve 内浮层工具”的使用感，不应表现为完整的独立桌面应用。
- 不得虚构尚未验证的功能、兼容性、性能、客户或市场证明。

## Brand Commitments

- 产品名称为 **Clackly**，应清晰、一致地使用该名称。
- 桌面版 Electron 与 DaVinci Resolve 的集成是产品身份的一部分。
- Resolve Workflow Integration 是首选实现路径。

## Evidence on Hand

- [`resolve-command-center/README.md`](resolve-command-center/README.md) 记录了现有架构、集成路径、开发流程和已知边界。
- [`resolve-command-center/electron/renderer/App.jsx`](resolve-command-center/electron/renderer/App.jsx) 展示了当前键盘驱动的命令搜索与执行流程。
- [`resolve-command-center/command-engine/commands/timeline.json`](resolve-command-center/command-engine/commands/timeline.json) 包含当前真实命令清单。
- 当前没有已确认的客户证言、使用数据、性能基准或市场声明；未来界面和文案不得自行补造。

## Product Principles

1. **键盘优先。** 高频路径应能在不依赖鼠标的情况下完成。
2. **保持工作上下文。** 呼出、执行和退出都应尽量减少对 Resolve 编辑流程的打断。
3. **浮层而非窗口。** 界面只占完成当前命令所需的空间，并迅速让位于工作区。
4. **Resolve 集成优先。** 优先使用 Workflow Integration 提供原生生命周期和能力访问。
5. **真实能力优先。** 只呈现当前可靠可执行的命令与证据，不承诺尚未实现或验证的能力。
