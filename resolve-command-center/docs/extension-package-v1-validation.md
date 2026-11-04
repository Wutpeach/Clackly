# Extension Package V1 验证与验收记录

2026-11-04，#4 / #5 最终 Review 为 PASS，用户同意完成验收，两个 Issue 已关闭。有效范围来自两个 Issue 的已批准 V1 基线；不包含 #6 搜索深化、#3 Developer Skill、#7 运行时 UI、商店、SDK 或第三方自动更新。

## 交付范围

- ZIP + JSON Manifest 的 .clackly；稳定 Extension/Command ID、Python 入口及 configSchema。
- 独立用户受管目录、包预检、显式 Install / Update / Replace / Downgrade、活动任务等待、原子状态切换、启停及卸载。
- 动态 Catalog 接入现有搜索及受管 Python Runtime；普通 Resolve Scripts 的路径策略保持原约束。
- Settings 保持 760×560 双栏，增加 Extensions 列表/详情，复用 SettingsRenderer、未保存保护与风险确认，支持英文和简体中文。
- 更新保留兼容配置，新增必填提示 Needs Setup；不兼容字段不进入脚本，卸载可选保留配置。
- 本地验收继续使用 Inno：同一源提交的明确 nonpublishable 包允许已验证的工作区改动，来源如实记录 dirty；正式发行的 clean / exact-tag / canonical workflow 规则不变。包内容、完整性、路径和官方 Native 检查保留。

协议与可重用示例见 [extension-package-v1.md](extension-package-v1.md) 和 [inspect-project](../examples/extensions/inspect-project)。

## 验证证据

以下路径均相对 resolve-command-center。build/ 被 Git 忽略，保存本地日志与产物，未作为 Release 发布。

| 检查 | 结果 | 本地证据 |
| --- | --- | --- |
| Node 全组 | 455/455 PASS | build/extension-v1-node-tests-final.log |
| 集成全组 | 126/126 PASS | build/extension-v1-integration-tests-final.log |
| Python 五组 | 87/87 PASS | build/extension-v1-python-tests.log |
| 本地安装来源与发布边界针对性测试 | 17/17 PASS | build/extension-v1-local-install-tests.log |
| Vite production build | PASS | build/extension-v1-renderer-build-final.log |
| Electron 36.3.2 候选与 package verification | PASS，含两种 CPython 实际启动检查 | build/extension-v1-package-local-electron.log、extension-v1-package-verify.log |
| 真实 Resolve 只读闭环 | PASS | build/extension-v1-evidence/resolve-readonly-smoke.json |
| Inno 实际安装 | 退出码 0，无需 Windows 重启 | build/extension-v1-inno-install.log、extension-v1-install-exit.json |
| 安装后清单与 Native | 5,360 个清单文件及 Native PASS | build/extension-v1-installed-verify.txt、extension-v1-local-install-result.json |

测试覆盖非法包/路径/链接/CRC/冲突、配置兼容、更新等待活动任务、写入失败及实例冲突。真实子进程在指针 rename 前后退出，重开后分别执行旧版/新版并读回配置；这是进程中断证据，不是断电一致性证明。

Settings/Palette E2E 使用 headless Edge、真实 Core/文件系统/Python，覆盖安装确认、草稿离开保护、保存/执行、同版 Replace、搜索即时更新、禁用/启用、降级、卸载、保留配置重装、中文、Escape 与确认框初始焦点。浏览器 transport/文件选择替代 Electron；Settings main-frame 管理 IPC 限制另有测试。截图见 build/extension-v1-evidence/ 中的 settings-extension-detail.png、settings-extension-detail-zh-CN.png、settings-replace-confirmation.png。

实际 Resolve 21.1.0.14 + 受管 CPython 3.14.4，通过隔离临时 appData 和外部 Scripting API 完成只读安装/搜索/执行、1.0.0 Replace、1.1.0 Update、0.9.0 Downgrade、配置保留、禁用拒绝和卸载移除。内置 5 个 Command 仍在 Catalog，普通 Scripts 发现 1 条。没有为回归验证触发修改用户项目/时间线的旧命令，旧功能行为回归以自动化为证据。

## 实际部署及恢复

用户明确批准本地非发布安装方案后，复用已验证 Electron 候选，经现有 Workflow 打包和 Inno 安装器部署。已安装版本为 0.1.5 本地开发验收版，publishable=false、source.dirty=true，构建基于 76b5a59228cfebd1f7a0604b31ba44a46fd97e69 的开发工作区。来源标记没有伪装为正式 Release。

- Workflow ZIP：build/extension-v1-local-workflow/Clackly-Workflow-0.1.5-win-x64.zip；SHA-256 4925d2e0c1aa8bfc93f051333898a7334880e97deaf2dffa84c4a9be2f937487。
- Inno EXE：build/extension-v1-local-setup/Clackly-Setup-0.1.5-win-x64.exe；SHA-256 035fa522b8f8b5ca8d54eeb8f4c6f4d4182e38f905a546fe76cfb95d91e9019a。来源与构建报告见同目录 build-report.json。
- 现有 Prepare 检查通过 Host 退出、固定路径与官方 Native cache-only 签名、Blackmagic 发布者、PE x64；安装后 Verify 通过，安装 Manifest 与构建输入字节一致。
- 安装前完整备份用户 Clackly AppData，51 个文件、8,846,160 bytes，逐个 SHA-256 一致；安装后文件摘要和文件数均未变化。
- 恢复目录：%LOCALAPPDATA%/ClacklyAcceptance/ExtensionV1-20261104-191730，含 Clackly-config、官方 Clackly-Setup-0.1.5-win-x64.exe、资产摘要和恢复说明.txt。官方安装器按 GitHub stable Release 的大小与 SHA-256 核验；它恢复程序，配置备份单独恢复。

回退时先退出 Resolve/Workflow，运行恢复目录中的官方安装器；如需恢复安装前配置，以同一 Windows 用户将 Clackly-config 内容复制回 %APPDATA%/Clackly。未建设额外事务/多版本备份系统，未修改共享 ACL 或历史失败记录。

## 人工验收与最终 Review

用户在真实 Workflow 中反馈：“验收通过，成功安装扩展”。随后两个 Issue 的最终 Review 均确认 PASS，并按用户决定关闭：[#4 最终 Review](https://github.com/Wutpeach/Clackly/issues/4#issuecomment-6632901364)、[#5 最终 Review](https://github.com/Wutpeach/Clackly/issues/5#issuecomment-6632902783)。

人工回执直接确认真实 Workflow 扩展安装；搜索/执行、Replace/更新/降级、配置迁移、启停/卸载、焦点/键盘及旧功能回归没有全部逐项人工回执，由上述自动化与只读宿主证据支持。最终 Review 接受这一证据边界，不追加所有路径都已实机人工通过的结论。

## 已接受的限制

- 默认 Electron 下载解压路径仍有 EPERM；退出 Resolve 后仍复现。使用项目已安装的同版本 Electron 36.3.2，配合 electron-builder 的 --config.electronDist=node_modules/electron/dist 成功构建，未修改默认配置或依赖。具体占用/权限原因未确定。
- 扩展状态写入期间崩溃可能遗留 state.lock；活动版本/配置仍可读取执行，后续写入须在确认所有 Clackly 实例退出后移除锁并重开。未引用的 revision/staging 残留不注册、不执行，但可能占空间。
- 第三方代码没有沙箱；执行沿用 10 秒、stdout/stderr 各 1 MiB 上限，不自动安装依赖。

以上限制保留，不作为本次 V1 验收阻断。没有发布正式 Release，未自动启动 #6/#3。
