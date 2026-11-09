# Clackly Docs Sync 操作与恢复

阶段 B 的开发交付，见 [Issue #11 启动要求](https://github.com/Wutpeach/Clackly/issues/11#issuecomment-6731488423)及[完整要求](https://github.com/Wutpeach/Clackly/issues/11#issuecomment-6731057442)。它提供增量检查和持久化回执，不创建或修改 Cindy 定时任务。开发验收不等于每日维护已启用。

## 安装位置与权威来源

- 仓库固定为 `Wutpeach/Clackly`，监控 `main`。公开 Pages 基线为 `bfd03d735744ece331d25b7b4e052a64c232f294`。
- 合并此开发 PR 并更新本机 main 后，入口为 `D:/Clackly/scripts/docs-sync.mjs` 与 `D:/Clackly/scripts/schedule-checks/clackly-docs-sync.mjs`。候选仍在 worktree 时，不应声称主目录已安装。
- 两个入口从脚本所在仓库推导状态目录，不依赖终端当前目录。前置检查导入相邻的 `../docs-sync.mjs`，不能只复制单个检查文件。
- 运行需要 Node 22.19+、Git；状态/PR/发布操作还需已登录且具备相应仓库权限的 GitHub CLI。脚本仅使用 Node 内置模块。
- `skills/clackly-developer/` 始终是扩展开发规范 authority。网站构建生成的协议页与原文不是另一个维护源。

## Cindy 配置与持久性验收

正确组合是 **执行方式：AI 任务**（`executionMode: agent`），再挂载**前置检查**（`preRunHook.command`）：

```text
node "D:\Clackly\scripts\schedule-checks\clackly-docs-sync.mjs"
```

这不是“仅运行脚本”任务。本文件输出 `CINDY_PRECHECK_OK` 和进程退出码，不实现 `cindy-script/1` 的 `call/complete` JSONL 协议。“仅运行脚本”模式不会在检查通过后启动 AI，并会在当前 Cindy UI 中隐藏前置检查设置内容。

用户验收代码后，按此顺序配置/检查；开发代理不得代为执行：

1. 确认 main 中两个入口都在。通过 `schedule_list(device=all)` 找到实际任务及其所在电脑，再用 `schedule_get` 回读。若已有 Clackly Docs Sync，编辑同一任务，不新建重复项；离线电脑不能当作不存在。
2. 保持用户选择的时间、时区、模型、通知和启停状态。选择“AI 任务”，保留[完整任务提示词](cindy-docs-sync-prompt.md)。
3. 新装或修改前置脚本使用 Cindy 原生 `schedule_set_pre_run_hook`：传实际 scheduleId 和已验证的 Node ESM 源文，由宿主安装、自测并挂载。当前该接口没有 timeout 参数，以实际回读字段/宿主默认值为准；脚本内部远端查询上限为 30 秒。使用工具返回的真实命令并核对路径与相邻 `docs-sync.mjs` 依赖，不凭预期命令声称已安装。不要误填 `scriptConfig.command`。
4. 保存后离开详情再重新打开；通过 `schedule_get` 再次核对 **同一 id、`executionMode=agent`、完整 `preRunHook.command`、工作目录 `D:/Clackly`、timeout 和用户选择的状态/计划**。记录前后回读和 updatedAt。仅磁盘有文件或编辑页显示文字均不足以通过。若 UI 仍异常，可在明确授权下读取本机 SQLite 的 `schedules` 对应行；不要直接改数据库。
5. 首次运行先审查基线以来实际提交，再由 `complete` 记录结果，不能直接手填当前 SHA。随后同 SHA 的真实运行应记为 `skipped`、exit 2、stdout 含 `CINDY_PRECHECK_OK`，且没有新 AI 会话。任务运行记录才是生效证据。

现有配置的只读诊断与“新脚本安装后保存→重开→运行”的验收是不同证据。未获修改任务授权时只做前者，明确保留后者为用户配置后的待验收项。脚本不会为了测试保存而开关、覆盖或运行任何任务。

## 前置检查协议

| 情况 | 退出码 | 成功标记 | 效果 |
| --- | --- | --- | --- |
| 首次无游标、main 有新 SHA | 0 | `CINDY_PRECHECK_OK` | 启动 AI 审查 |
| pending、未解决失败、已完成 JSON 回执但 SHA 镜像写入中断 | 0 | `CINDY_PRECHECK_OK` | 优先启动恢复；不依赖网络或新提交 |
| 完整状态一致，远端 main 与已审查游标相同 | 2 | `CINDY_PRECHECK_OK` | 跳过 AI |
| 网络/超时、未知锁、损坏状态、非法 SHA、游标缺少状态回执 | 1 | 无 | 阻止本轮，保留状态并报告 |

远端查询使用 `git ls-remote --exit-code https://github.com/Wutpeach/Clackly.git refs/heads/main`，关闭交互并设置 30 秒超时。检查不写游标、状态、锁或 PR。恢复放行只表明“需要 AI 处理已知未完成事项”，不声称 GitHub 查询已成功。

## 命令与输入

```text
node scripts/docs-sync.mjs status
node scripts/docs-sync.mjs publish D:/Clackly-artifacts/run/input.json
node scripts/docs-sync.mjs review D:/Clackly-artifacts/run/review.json
node scripts/docs-sync.mjs merge D:/Clackly-artifacts/run/range.json
node scripts/docs-sync.mjs deploy D:/Clackly-artifacts/run/range-after-merge.json
node scripts/docs-sync.mjs complete D:/Clackly-artifacts/run/completion.json
node scripts/docs-sync.mjs failure D:/Clackly-artifacts/run/failure.json
```

`status` 完全只读，不创建锁或初始状态。其它命令互斥；失败保留 lastFailure 和已经落盘的意图，不推进游标。输入 JSON 放独立 artifacts 目录。示例中的占位符必须替换为实际证据，不能原样执行。

`publish` 示例：

```json
{
  "from": "<status.durableCursor；首次用已核实的 baselineSha>",
  "through": "<实际已审查的当前远端 main 40 位 SHA>",
  "topic": "extension-docs",
  "title": "docs: describe the released extension behavior",
  "body": "具体变化与验证证据；Refs #11；Assisted-by: Cindy (https://cindy.app)"
}
```

先在独立 worktree 准备并推送 `docs/sync-<topic>`。分支必须包含当前已审查 main；main 前进时普通 merge main 到文档分支并推送，不强推。`publish` 读取完整 PR 范围、包含重命名前路径，先查询再创建；回执丢失重查并恢复同一 PR。HEAD 或已审查 main 基线变化都会清除旧审核。已完成主题再次使用须 `newRound: true` 且有不同 HEAD，避免文档自身合并引发重复 PR。

自动更新仅允许 `site/**`、`docs/**`、根 README、官方 Skill 的 `.md` 文字和现有 Pages workflow。应用代码、Skill schema/可执行示例、状态管理脚本及其它工作流不在自动更新范围。文本中的协议语义仍必须由独立审核核实，文件后缀不是语义审核的替代。

`review` 示例：

```json
{
  "headSha": "<实际 PR HEAD>",
  "verdict": "PASS",
  "model": "codex/gpt-6.1-terra",
  "effort": "max",
  "permissions": "full-access",
  "workerSessionId": "<实际独立 Cindy Worker 会话 id>",
  "evidence": ["<Worker 实际配置与完整结论的可定位记录>"]
}
```

只有真实使用指定 Worker 才能填写这些字段。它们是可审计的 Lead 回执，不是密码学签名；本地脚本不能独立证明 Worker 的模型和思考过程。Lead 必须从 Cindy 原生创建/回读凭证核实，不能自行给出 PASS。Full Access 也不提供硬只读隔离，必须明确限制 Worker 不写代码、不合并。

`merge`/`deploy` 输入均含真实 `from`、`through`。`merge` 只接受当前 HEAD 的独立 PASS、同 HEAD 且记录同一 PR/main 基线的 main/Docs Sync CI，以及站点变更所需的 Docs CI；检查冲突、requested changes 和未解决 review threads。最终使用 GitHub 服务端 `--match-head-commit` 普通合并，不 force/admin。若主线变化先审查缺失范围、合入 main 并重新 publish/审核/运行 CI；若合并回执丢失则找回同一合并。

沿用 Ameow 的自动维护方式：当前 PR HEAD 的独立 Worker PASS、必要 CI 成功、无冲突及未解决阻塞后，合并前再核对 main；发现变化则停止并检查缺失提交后重试。Docs Sync 不要求启用严格分支保护、required status checks 或管理员约束，也不修改仓库保护设置。普通合并遵守 GitHub 现有规则，不使用 force/admin。main 核对是合并前的检查，不是服务端 base 锁。

合并前会把核实的 PR/HEAD/base 和 CI run ID 一起持久保存。GitHub workflow run 的 `pull_requests` 是可变关联，PR 更新后会改变、合并后可能为空，不能当作历史证据。complete/丢回执恢复使用已保存绑定，再按 run ID 核实真实 workflow、event、HEAD 和成功状态；不再要求已合并 PR 仍在关联数组。外部合并且没有本工具合并前 CI 绑定的 pending 会停止，保留现场供人工核实，不凭空补造凭证。

`deploy` 只在实际影响 Pages 时通过现有 main workflow `workflow_dispatch publish=true` 发布，并传 `expected_sha=<已审查 main>`。workflow 在构建前检查这个 SHA，阻止检查与 dispatch 之间主线移动导致发布未审查版本；原有手动发布门禁保留。代码会先查已有成功部署，保存 dispatch 意图，找回同一 run。回执未知且查不到运行时安全停止，不盲目重复 dispatch；确认失败的 run 只有显式 `retryDeploy: true` 才可重试一次。返回 waiting 时保留现场，后续恢复，不用循环重复发布。

`complete` 示例：

```json
{
  "from": "<status.durableCursor；首次用已核实 baselineSha>",
  "through": "<审查至合并/必要发布后的实际当前 main SHA>",
  "baselineSha": "bfd03d735744ece331d25b7b4e052a64c232f294",
  "scheduleId": "<用户验收配置后的实际 Clackly 任务 id；未配置时省略>",
  "reason": "本次实际审查范围、公开版本事实及无需更新或已完成的依据",
  "evidence": ["<diff/Issue/PR/Worker/CI/必要发布与清理的实际证据>"]
}
```

首次完成必须明确提供 baselineSha 并审查它至 through 的真实历史。已知游标必须是 through 的祖先；complete 前再次确认 main 没移动。有 pending 时还须满足当前 HEAD 的 PASS、成功 CI、实际 merged，及必要部署的 SHA 祖先关系、对应 main 手动 Actions 成功和四个公开入口的 HTTP/标题检查。还会比较成功部署 SHA 到 through 的真实 Git diff：期间有 Pages 内容/生成依赖变化时，旧部署不能覆盖它们，不能清空 pending 或推进游标；只有非站点变化可复用旧部署。HTTP 检查只证明页面可达性；部署 SHA 由 GitHub deployment/Actions 回执证明，不从页面标题推断。

即使没有 pending，from→through 有 Pages 相关变化也必须找到覆盖它们的成功部署；找不到则保留进度并通知用户，不制造空 PR 或把未上线内容标为完成。没有 pending 的独立主线发布目前交用户处理，成功回执可在下轮恢复时核实；不把这种安全停止称为无人值守成功。

`failure` 输入 `{"reason":"实际失败原因与证据位置"}`，保留游标与 pending。不要用 failure 覆盖损坏的未知状态；此时原样保留并通过 Cindy 通知用户。

## 持久状态与恢复边界

- `.clackly-docs-reviewed-state.json`：唯一完成回执、review history、pending PR/HEAD/审核/CI/merge/deploy 与 lastFailure。repository/branch/schema/baseline 不匹配即停止。
- `.clackly-docs-reviewed-sha`：完成 SHA 的镜像。先原子保存 JSON 完成回执再更新镜像；镜像落后且对应已知历史时唤醒恢复，不能把不明游标当作进度。
- `.clackly-docs-sync.lock/owner.json`：命令互斥。未知锁不自动清除；先核对进程、文件和正在进行的操作，由用户确认恢复。
- 状态、镜像、临时原子写入和锁均被 Git 忽略。首次没有 scheduleId；只有从实际 Cindy 任务读取后才绑定，后续 id 不同会停止，不能导入 Ameow 的记录。

失败恢复先执行 status，再处理已有 pending。创建/合并/部署的返回不明都先查询真实状态，不重复外部动作。关闭且未合并的 PR、含糊的多个回执、不明 dispatch 或未知锁允许安全停止并通知，不承诺自动猜测。merge 意图已写但服务端仍未合并、同时 main 前进时，phase=merging 会阻止新 publish，须人工核实恢复；不得删 pending 绕过。开发脚本或 CI 通过不授权清空这些记录。

开发测试使用临时目录、隔离状态和可注入 GitHub 边界；真实 GitHub PR 演练也只用独立 smoke 状态。不得为测试推进 `D:/Clackly` 正式游标、改 Cindy 任务、合并开发候选或重复部署正式站点。

## 验证

```text
node --test scripts/docs-sync.test.mjs scripts/schedule-checks/clackly-docs-sync.test.mjs
```

CI 在 Windows/Linux 使用 Node 22.19 执行。站点相关改动另执行 `site/` 构建、双语/链接/Skill 校验及必要浏览器测试。最终 HEAD 的代码、CI 和独立 Worker 证据随开发报告回写 Issue #11；用户产品验收和 Cindy 实际配置/运行证据均不能被脚本测试替代。
