# 历史记录：R28/R29 清洁试装

2026-11-05 整理：当前安装及 Settings 更新已经改用
[Inno Setup](../inno-setup/README.md)。下方旧版本工件、固定路径和现场操作步骤
仅用于历史追溯，不是当前安装指南，也不表示本轮已授权试装。
旧 `.trellis/research/` 路径按记录原样保留，不保证仍可直接访问。

---

## R29 当时的现场确认记录

当前有效步骤、精确删除路径、共享目录权限保持原样、新配对工件 SHA 与验证结果，见：
D:\Clackly\.trellis\research\10-30-tra-25-r22-setup-production-path\r29\现场操作确认.md。

以下全文为 R28 历史说明，已被 R29 取代，不得据此运行旧 EXE 或要求额外完整备份。

---

# R28 人工试装准备：仅下一阶段单次批准后执行

**结论：可交给用户在批准条件下试装。** 这表示已提供受控候选供网页审查和下一阶段单独批准，**不是本轮运行许可、实机 PASS 或公开发行**。本轮没有真实受保护目录部署、普通令牌→真实 UAC→管理员令牌验证，也没有真实 Resolve/Native 安装验收；这些必须如实作为下一阶段用户试装的待验项。

## 精确工件与来源

本机审查目录：`D:\Clackly\resolve-command-center\build\windows-setup-r28`。仅 **launcher + trial 两文件成对**用于未来受控试装；普通 candidate 只能 Verify，fixture/native-fixture 只能惰性测试。五文件均 x64、NotSigned、manifest asInvoker；无文件已经公开发行。

| 构建身份 | 文件名 | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| candidate | Clackly-Setup-0.1.3-win-x64-LOCAL-CANDIDATE.exe | 32,781,824 | `ec5aa464057a8b88e99cbf9a0e9d96191466136abdca1fb66b7ad3a5eb22c1fe` |
| fixture | Clackly-Setup-0.1.3-win-x64-INERT-FIXTURE.exe | 32,798,720 | `061bcef40ae48e1563e05d3a7052d4857cfe6e8560fca2c7b969472422cd028c` |
| trial | Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.exe | 32,784,384 | `62991160decf07a3e980c7b417a513b938d51eba5af65a4ec4c3d5d45a1da4ab` |
| launcher | Clackly-Setup-0.1.3-win-x64-CONTROLLED-LAUNCHER.exe | 160,768 | `ef8ca1353e99b3fd1a716ec5be2fd66bc9d3e40c837632e8e1ce4d3f42d2dd09` |
| native-fixture | Clackly-Setup-0.1.3-win-x64-NATIVE-INERT-TEST.exe | 297,472 | `9edb5ff99f1b101037674eea4fcc27d3f5c9fa3b384a5465d3094b1e4b3001f5` |

目标版本 **0.1.3**。内嵌 ZIP 是已公开正式 v0.1.3：Release `428867234`、Asset `691653752`、32,601,075 bytes、SHA-256 `425ea8981965c998530e0aa3f8416032c17172c136e6f92f14f577f26621a640`，payload commit `a2315fb20225beb919f1c6c4d1a80d04dc7e9cd9`。它不是 Setup 源码 commit；Setup 是 main/HEAD `77b083535e0cd06e152206bf769c6e11efdbf84d` 上的明确未提交差异，完整源码/资源身份见 build-report 与 R28 Report。

launcher 内嵌批准的 trial 精确 SHA。试装信任来自独立可信渠道核对上述**两个 EXE**的身份与受保护位置，不能以旁边可修改的 JSON/SHA 清单代替授权；改名普通候选不能使其安装。商业签名证书不作为这一次私有试装的自动前置；公开发行的发布者、签名及真实普通用户验证仍须独立批准。

## 下一阶段最小批准与准备

1. 网页 Review 本轮源码/证据后，用户另行明确批准：**仅在指定可还原的干净 Windows x64 / Resolve Studio 测试环境，准备受保护位置、运行这一对精确 SHA 工件、同账户 UAC、一次安装和用户自行关闭/重开 Resolve、读取验收日志**。当前真实 v0.1.2 机器不在这个批准中。
2. 维护者确认测试基线可整体恢复（测试机镜像或 VM 快照等既有恢复手段任选），并核对正式 Studio、唯一且可验证的 Host/官方本机 SamplePlugin Native 来源。Native 不随 ZIP/EXE 分发，不执行来源未知的 .node。首次试装优先无既有 Clackly/旧请求/pointer/历史事务的环境；clean upgrade 也只接受原引擎认可的完整旧树与历史。
3. 维护者在这次单独授权下，将两文件复制到一个全新的固定目录：`C:\Program Files\Clackly Setup R28`（以系统真实 ProgramFiles 为准）。该目录、文件和可替换祖先须由 Administrators/SYSTEM/TrustedInstaller 拥有，普通用户不能写入、删除、替换或改权限；目录内只放批准的一对 EXE，不带额外 DLL/config/重定向文件。目录准备本身需要独立批准的管理员操作，**本轮未执行，也没有自动从 Downloads/TEMP 提权复制的捷径**。复制后再次独立核对两 SHA。
4. 只支持同一账户的分离令牌管理员从普通 Explorer 启动。标准账户使用另一个管理员凭据、直接“以管理员身份运行”、非固定目录、重解析/硬链接、错误 SHA/ACL、用户 SID 为新文件默认所有者等情况必须拒绝。不要通过修改系统默认所有者、安全策略、Defender 或清理历史来强行放行。条件不符就停止，由维护者修订最小方案。

## 用户获准后的操作

1. 保存工作。在独立可信的 R28 审查记录核对两个 SHA 后，从固定目录正常双击 **CONTROLLED-LAUNCHER.exe**；不要直接双击 trial、传入参数或从 Resolve/Settings 启动。
2. 原生入口先核对位置、ACL、两个文件及固定 trial SHA，并持有防替换句柄；随后显示受控试装确认。点取消应直接结束，没有安装 worker/事务。点继续才出现 Windows UAC，预期为该未签名 launcher、**未验证发布者/未知发布者**；只在本次精确构建已获独立批准且显示正确时接受同账户提示。拒绝 UAC 应显示取消/授权未完成，没有启动托管安装器。系统若额外拦截，停止交维护者，不关闭系统防护。
3. 提权端重复检查自身 SHA、trial SHA、路径/权限、同账户 SID 和令牌默认所有者，再用限定环境启动原 Setup。托管 Setup 再次检查，显示“R28 受控单次试装候选”；用户仍须勾选明确同意并点“开始受控安装”。管理员进程仅在新建私有 session 中运行持有且逐项核对的内嵌脚本/ZIP，不执行用户 TEMP 缓存。WindowsPowerShell 子进程只对这一受保护脚本使用进程范围 ExecutionPolicy Bypass；不修改持久安全策略。
4. 安装器按固定官方 API 核验 Release/Asset/ZIP、完整 inventory/Runtime/来源提交，失败必须停止。R26 在线 PASS 仅是历史，本轮新 EXE **没有新在线 Verify PASS**。随后读取安装资格与旧树/用户数据保留快照。
5. 出现等待提示后，自行确认保存并退出 Resolve，再按安装器的等待确认继续；安装器不自动关闭宿主。未知 Host/Native 来源、错误签名/PE/配对、并发、未知旧事务等都应停止。准备阶段可请求取消；文件替换开始后不要关闭窗口或终止进程。
6. 只有实际 worker 退出、一个新的独立 Inspector 完整核验后才显示安装文件核验完成。请自行重开 Resolve，验证 Workflow 能加载、显示 0.1.3、常用命令可运行，已有设置仍在。记录真实 UAC/进程生命周期、Host/Native、文件结果和 Resolve 行为，不把单纯退出码或“来源验证通过”当安装成功。

## 失败、未知状态与维护者恢复责任

- 授权取消/替换前安全取消：不应替换目标；保留证据即可。来源/Native/Host 拒绝不是安装成功。
- 明确 rolled-back：仍需独立 Inspector 确认完整旧树后再由用户重开 Resolve；旧版备份留在原事务目录中，不自动清理。
- 缺少 Inspector、进程被结束、无法确认/超时、recovery-required：保持 Resolve 关闭，不重复运行、不删除 pointer/事务/备份。保留受保护目录中的 `Clackly-Setup-<id>` session 以及原 scan 相邻的 `.Clackly Updates` 事务证据，由维护者读取 context/journal、实际完整新旧树和锁进行独立审查。
- 恢复由维护者负责：优先还原事先确认的可丢弃测试环境基线；若处理具体旧树，只在单独批准和核对身份后复用唯一 WorkflowTransaction 的既有恢复能力或给出针对这一次的完整旧树恢复方案。**没有向用户交付可盲用的 Setup 通用恢复命令，不能直接拿 Setup id 调用旧 request recover.ps1。**

当前真实机器仍是带旧 orphan/request/pointer/事务和用户配置/DPAPI 的 v0.1.2，资格独立 **BLOCKED**；本轮没有迁移、清理、备份或改写它。测试环境的条件式候选不解除这个阻塞。当前也未授权公开 Setup、Settings 闭环或 v0.1.4/v0.1.5。
