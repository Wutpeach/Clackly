# Clackly Docs Sync

负责 Clackly 的增量、可恢复文档维护。仅在用户已验收本实现、亲自在 Cindy 配置并启用本任务的真实自动化运行中执行下列自动合并/发布策略。开发任务阅读本提示词不会获得这些执行授权。不得自行修改任务、运行频率、启停状态或前置检查。

- 项目：`D:/Clackly`；仓库：`Wutpeach/Clackly`；分支：远端 `main`。
- 站点：`site/`，中文/英文；公开地址：`https://wutpeach.github.io/Clackly/`。
- 扩展规范 authority：`skills/clackly-developer/`；不要维护并行协议副本。
- 操作/JSON 合同：先读 `docs/docs-sync.md` 和脚本实际内容，遵守 AGENTS.md 与 Issue #11 当前有效要求。
- Cindy 必须是 **AI 任务 + preRunHook**。前置命令为 `node "D:\Clackly\scripts\schedule-checks\clackly-docs-sync.mjs"`，不是“仅运行脚本”任务本体。

## 1. 检查真实任务和恢复状态

确认这是实际 Cindy 自动化运行，并通过原生能力核对同一 Clackly 任务的 id、设备、工作目录、executionMode=agent、已保存的 preRunHook 命令及用户选择的 active 状态。不以编辑界面或文件存在代替配置回读；任务不明或字段不符时停止并通知，不重建任务。

执行 `node scripts/docs-sync.mjs status`。优先恢复 pending、lastFailure、镜像中断。互斥锁、未知 schema/仓库或损坏状态一律保留并停止，禁止直接编辑游标、删除锁或清空 pending。实际 scheduleId 只从本任务读取，不沿用 Ameow 或开发 smoke 的 id。

安全 fetch main，读取真实 Git SHA 和基线/游标以来未审查的完整历史。首次基线是 `bfd03d735744ece331d25b7b4e052a64c232f294`，不得直接把当前 HEAD 当作完成。状态或网络失败不是“无变化”。

## 2. 判断文档是否需要更新

按实际 Git diff、相关 Issue/PR、正式 Release 与必要源码核实产品事实。区分已公开发行（起始为 v0.1.6）、main 已实现但未发行、候选与未来规划。不要把 main 直接写成已发布版本。文档/本维护脚本自身合并不自动构成新的产品变化。

无实质文档更新且无 pending 时，按实际 from/through、基线和证据调用 complete，可靠记录已审查结果并安静结束，不创建空 PR。

## 3. 必要维护和 PR

使用独立 worktree/分支，保护主工作区及其它任务的未提交改动。仅修改必要双语内容、导航、站点资源、可信截图和官方 Skill 的文字；不能修改应用业务代码、扩展运行时、协议语义、schema、可执行示例、打包器或状态脚本。生成协议页在 authority 上修改并由构建生成，不另造副本。

一轮最多一个实质性文档 PR；先恢复同主题待审项。分支使用 `docs/sync-<topic>`，推送后调用 publish。新一轮复用完成主题只在确有不同变更时显式 newRound，不因文档自身合并循环建 PR。PR 写明具体行为、版本事实、必要验证及 `Assisted-by: Cindy (https://cindy.app)`。

执行必要脚本测试、站点构建、双语/链接/资源/Skill 校验和受影响浏览器路径，不重复无关应用测试。

## 4. 独立 Check Worker

通过 Cindy 原生能力创建独立上下文的 Check Worker，目标配置必须是：

- 模型 `codex/gpt-6.1-terra`（GPT-6.1 Terra）。
- 思考强度 MAX。
- Full Access；这不是硬只读隔离，指令必须明确只审查、不写代码、不合并。

从创建/回读凭证验证实际配置，无法提供就停止报告，不冒充等效配置。交接当前 PR URL、完整 HEAD、范围、必要产品背景、验证证据和只读边界。Worker 独立检查真实 diff、版本事实、双语、链接/可信截图与许可、Skill authority、权限及恢复行为，返回 PASS/REPAIR/BLOCK 和实际审核 SHA。

保存实际 Worker 会话/配置与结果作为证据，再调用 review。Lead 不能自行签发 PASS。HEAD 变化立即使旧审核失效，重新 publish 并审核。REPAIR/BLOCK 可进行一次有明确边界的修复与复审；不能安全解决则保留现场并通知，不无限循环。

## 5. 合并和必要 Pages 发布

只在用户启用的本任务内，当前 HEAD 获独立 PASS、必要 CI 对同 SHA 成功、范围合规、无冲突/未解决阻塞时调用 merge。脚本使用 GitHub 服务端精确 HEAD 校验普通合并；不 force/admin，不绕过保护。main 移动先审查缺失提交，不以旧证据推进。

确认实际 merged 和 merge SHA 后审查至最新 main。涉及 `site/**`、生成站点所依赖的 Skill 文字或 Pages workflow 才调用 deploy。它使用既有 `deploy-docs.yml` 的 main 手动 dispatch、publish=true、expected_sha=已审查 main，保留发布门禁并防止发布未审查的主线。纯仓库文档无需发布。

查询已有部署与 pending run，回执不明先恢复同一 run，不重复 dispatch。需要等待时保留状态，有限检查该 run；不反复触发工作流。确认部署 SHA、对应 Actions 成功及四个公开入口可达后才算发布完成。明确失败且已安全处理原因后至多显式 retryDeploy 一次；否则通知用户。

## 6. 清理、完成与异常

合并及必要部署确认后，只安全清理本轮已完成的临时 worktree/分支；核对归属、合并状态、未提交和有价值的忽略文件，不强制删除或影响其它任务。主工作区更新仅用安全快进，不能 reset/stash 丢弃用户改动。

核对实际 from/through，再调用 complete，记录真实 Worker、CI、merge、部署和清理证据。失败、漏跑、main/HEAD 变化、CI 或发布异常都不推进游标。可安全记录时调用 failure；未知状态保持原样。

无需更新或全部完成安静结束。需要用户处理的 REPAIR/BLOCK、配置异常、CI/发布失败或恢复受阻，使用 Cindy `schedule_notify_current_run` 提供具体原因、状态和证据。不要发成功假回执，不额外发布应用安装包、不操作 Resolve、Ameow 或其它自动化。

完成标准：实际增量审查 → 必要更新 → 唯一 PR → 当前 HEAD 独立审核和 CI → 普通合并 → 必要发布 → 安全清理 → 持久完成回执。
