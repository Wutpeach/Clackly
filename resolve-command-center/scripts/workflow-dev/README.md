# 本地 Workflow 开发部署

在管理员权限的终端、resolve-command-center 下执行：

~~~powershell
npm run workflow:deploy:dev
~~~

先保存工作并退出 Resolve 和 Clackly。入口不会关闭或重启应用，不运行真实项目操作；安装完成后用户自行打开 Resolve 验收。要求 Windows x64、Node/npm、Git、Windows PowerShell 5.1、Inno Setup 6.7.1，以及官方 Resolve SamplePlugin Native。当前入口只接受已注册的实体 Inno 安装；缺失、Junction、未知安装、更新待恢复、运行中的 Electron/Resolve/安装器均拒绝。不会自动提权。

必须在 main 提交全部开发改动，再运行命令。脚本创建准确 HEAD 的独立 detached worktree，运行锁定的 npm ci、受管 Python staging、renderer build、Electron Builder、现有 Workflow/Runtime 校验和 Inno 编译。产物明确 publishable:false、source.dirty:false，不 Push、不打 Tag、不发布 Release。主工作区和快照在构建后都再次检查，不能混入脏工作区。

**实体 Inno 安装仍由 Inno 更新。** 为保留卸载文件清单和升级一致性，入口内部生成本地 Workflow ZIP 中间产物与 Setup EXE，并自动静默运行现有安装器；用户无需每轮手动运行 Setup。此处没有新增正式更新器，也不让 Copy/Junction 接管 Inno 目录。

证据在 build/workflow-dev/<session-id>/：各阶段日志、ZIP、EXE、Inno 编译报告、deployment-build.json，含完整 commit、锁文件 SHA-256、工具版本、Runtime/Native 验证与产物大小/摘要。成功后移除本轮 clean detached worktree，保留产物和日志；失败时保留快照用于调查，不清理其他任务。

受保护的 %PROGRAMDATA%/Clackly Dev Deploy/<session-id>/ 保存：

- previous/：部署前插件完整文件备份，逐文件 SHA-256 核对，包括 Native、完整 Runtime、Inno 卸载文件。
- uninstall.reg、permissions.acl：固定 Clackly 卸载注册表键和旧目录权限；回滚时一起恢复。
- appdata-backup/：当前用户 Clackly 配置备份，包含私人数据，不应上传。部署和回滚均不写回 AppData。
- deployment.json：备份/当前树、用户配置与相邻插件的文件清单、状态和错误；build.json 记录安装来源；inno.log 记录实际安装。

安装前后核对完整 payload、来源 commit、Inno 注册、官方本机 Native hash、两种 CPython 实际启动及身份；验证 %APPDATA%/Clackly、旧宿主配置目录和相邻插件未变。Native 在备份旧程序前以现有校验模块完成签名、x64 和 Resolve 配对 Electron 的受限无窗口加载检查；不调用 Resolve API。这里只改变本工具工作区 ACL，不收紧共享 Resolve 目录权限。

失败时在 Host 仍关闭、备份和注册表/ACL 摘要完好的条件下自动恢复；失败的新树保留为 replaced/，不直接删除。显式回滚同样要求当前安装未被后续修改：

~~~powershell
npm run workflow:deploy:dev -- --rollback <session-id>
~~~

回滚把旧目录及其 ACL、卸载注册信息一起恢复，保留新旧文件供调查。不会回退用户配置。若 Host 已重开、备份被修改或不能完成恢复，状态为 recovery-required，应保持 Resolve 关闭并检查证据；不会宣称成功。

入口使用独占 deployment.lock，硬中断后可能留下锁。只有核对记录 PID/进程确已退出、没有其他安装器运行后，操作者才可移除该**确切锁文件**并用记录的 session-id 回滚；不要删除备份或历史更新目录。未完成会话会阻止下一次开发部署。

验证：node --test scripts/workflow-dev/deploy.test.js。文件系统测试覆盖成功、显式回滚、安装失败、校验失败、Host 重开、源/备份/元数据变更和 Junction 拒绝；不代替真实 Inno/UAC/卸载验证。部署成功也不等于 #7-A 产品验收；真实 Resolve 焦点、遮挡、系统选择器和输入/结果体验由用户确认。
