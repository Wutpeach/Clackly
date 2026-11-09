# Satin Enamel A 图标替换

2026-11-09。使用用户提供的 `Clackly-Icon-A-Satin-Enamel.zip`，原包 SHA-256：
`364a9092b285bca63b0fbe6b71682af6e204d1b4091f89d8479c17d1f7f9ef0e`。
已核对 manifest 中全部 16 份文件的哈希。未重绘、重采样或修改原图标。

| 使用位置 | 原包资源 | SHA-256 |
| --- | --- | --- |
| Windows 应用、Palette/Settings/Command/View 窗口、安装器和卸载入口；网站 ICO fallback | `ico/clackly-A-windows.ico` | `252b7f1312c24afa13f72fbe1fd7c4bc7e88d4e70e128de9994f1924a1346d6c` |
| 产品页与文档页品牌图标 | `svg/clackly-A-compact.svg` | `f79fdbfacd5920cbaf835d10b8a8b41a03117b1bafb03d3be6377fc1dc67abd1` |
| 全站 SVG favicon | `svg/clackly-A-micro.svg` | `e4fe9146755f6d736cc525d0b9b742010eee6955ee6db953a29d1e3ec3363977` |

ICO 内 16/20 px 为 Micro，24/32/48 px 为 Compact，64/128/256 px 为完整 Satin Enamel A；每一帧与包内对应尺寸 PNG 逐字节一致。网站更新了 favicon 缓存版本；两份 SVG 通过 Git attributes 保留原始字节，构建继续核对资产哈希。

应用沿用本地 R1 提交已完成的窗口、打包及 Inno 入口，只替换素材并更新 8 帧预期。原始本地 main 的 R1 提交 `f46107246bf6994eab26a043a35ddaaa1b76268a` 保留不变。

验证：

- 现有窗口和 Windows 图标测试：49/49。
- `npm run package:win`、`npm run package:verify` 通过；实际 `Clackly.exe` 的全部 8 个图标资源帧与源 ICO 完全一致。
- 已构建非发布 Workflow ZIP 及 Inno Setup EXE，安装器的全部 8 帧也通过资源校验；未安装或改变现有运行中的应用。
- 使用隔离 Electron 36.3.2 实际创建隐藏 Settings 原生窗口；未连接 Resolve、未注册全局快捷键、未接触用户配置/工程。Windows `ExtractAssociatedIcon` 从实际 EXE 提取的 [32px 图标](windows-exe-icon-32.png) 与原包 32px PNG 像素完全一致。
- 站点构建通过：41 HTML、19 对双语页面、3,032 项内部链接/资源/锚点，19 份 Agent 原文一致。
- 站点浏览器回归：12/12；实际检查中文浅色、英文深色、手机文档与首页。
- 设计扫描发现的是原有首页样式 advisory；本次只改变 favicon 引用，未调整首页设计或样式。

浏览器预览：[中文文档](http://127.0.0.1:4321/Clackly/docs/) · [English](http://127.0.0.1:4321/Clackly/en/docs/) · [产品首页](http://127.0.0.1:4321/Clackly/)。仅本机可访问。

实际页面截图：[中文浅色](docs-zh-light.png) · [英文深色](docs-en-dark.png) · [手机文档](docs-zh-mobile.png) · [产品首页](home-zh.png)。

本地安装候选位于 `resolve-command-center/release/icon-a-setup/Clackly-Setup-0.1.6-win-x64.exe`；它是保留真实 dirty 来源的 `publishable:false` 本地验证包，不是新的公开 Release。没有推送 main、合并或发布网站，也没有停止现有应用进程。
