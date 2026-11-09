const shared = {
  'zh-CN': '先确认我实际安装的 Clackly Host 版本与所需能力。读取官方 clackly-developer/SKILL.md、相关 references 和完整示例；它们是协议权威。若无法读取本机 Skill，说明缺少哪些资料，使用我提供的完整目录，或读取 https://wutpeach.github.io/Clackly/llms.txt 与其中的原始文件。不要猜测 API、Manifest 字段或 Host 能力。优先 Python 标准库，不静默安装依赖。确认操作是只读还是写入；所有写入用稳定项目/对象 ID 重新校验并说明后果。不添加任意 Web UI、后台服务或沙箱保证。不修改安装目录。先做离线语法、正常/缺少数据/过期目标测试，再用官方 package_extension.py 打包到源码目录以外。交付可编辑源码、.clackly、实际验证结果和剩余宿主测试步骤。未经我授权，不操作真实 Resolve 项目。',
  en: 'First verify my installed Clackly Host version and required capabilities. Read the official clackly-developer/SKILL.md, relevant references and complete examples; these are the protocol authority. If the local Skill is inaccessible, say what is missing and use the complete folder I provide, or read https://wutpeach.github.io/Clackly/llms.txt and its raw sources. Do not invent APIs, manifest fields or Host capabilities. Prefer the Python standard library; never silently install dependencies. Identify reads versus writes; revalidate stable project/object IDs before writes and explain consequences. Do not add arbitrary Web UI, background services or sandbox guarantees. Never edit installed files. Check syntax and offline normal/missing-data/stale-target cases, then package outside the source folder with the official package_extension.py. Deliver editable source, a .clackly, actual check results and remaining Host test steps. Do not operate real Resolve projects without my permission.',
};
export function prompts(lang: 'zh-CN' | 'en') {
  const tasks = lang === 'en' ? [
    ['create', 'Create an extension', 'Build a read-only Clackly extension that reports the current project name and timeline count. Handle no open project. Choose stable, unique extension and command IDs.'],
    ['command', 'Add a command', 'Add a timeline summary command with a one-run input form and explicit structured result to my extension. Preserve extension ID, command IDs and compatible settings. Read Command UI; use Prepare only for live choices.'],
    ['view', 'Build an Extension View', 'Build a read-only marker browser from the official Marker Browser example. Support search, filters, details and copy. Read Views and use Host-rendered List/Detail. Explain marker identity limits; never use that identity for writes.'],
    ['forms', 'Create, edit and batch', 'Add Create/Edit Forms and confirmed batch prefixing to my timeline tool. Read Views and Timeline Manager. Revalidate native project/timeline IDs and name snapshots before each write; return per-ID partial failures. Explain no transactions or Undo. Leave live testing to me in a disposable local project.'],
    ['repair', 'Modify or fix a tool', 'Fix the extension source and error report I provide. Reproduce the failure offline, preserve identity and compatible settings, add a useful regression check and package a versioned replacement. Never patch installed files.'],
    ['verify', 'Verify and package', 'Review my extension against official manifest, lifecycle, UI and safety contracts. Check normal, missing-host-data, stale-target and failure cases. Run the official packager. Distinguish offline checks from Resolve tests; deliver source and the archive.'],
  ] : [
    ['create', '创建第一个扩展', '做一个只读 Clackly 扩展，报告当前项目名称与时间线数量，处理没有打开项目的情况。选择唯一、稳定的扩展与命令 ID。'],
    ['command', '添加扩展命令', '给现有扩展增加时间线摘要命令，提供单次输入表单和结构化结果。保留扩展 ID、命令 ID 与兼容设置。先读 Command UI，确实需要实时选项时才用 Prepare。'],
    ['view', '创建 Extension View', '基于官方 Marker Browser 示例，做一个只读标记浏览器，支持搜索、筛选、详情和复制。先读 Views，使用 Host 渲染的 List/Detail。说明标记身份的限制，不将这种身份用于写入。'],
    ['forms', '创建、编辑与批量操作', '为时间线工具加入 Create/Edit Form 和需要确认的批量名称前缀。先读 Views 与 Timeline Manager。每次写入前重查原生项目/时间线 ID 与名称快照；按 ID 返回部分失败。说明没有事务与 Undo。由我在可丢弃的本地项目中手测。'],
    ['repair', '修改或修复工具', '根据扩展源码和错误报告诊断修复。先离线复现失败行为，保留身份与兼容设置，添加最小有效回归检查并打包带版本的替换包。不要修改已安装文件。'],
    ['verify', '验证与打包', '按官方 Manifest、生命周期、UI 和安全协议审查扩展。检查正常、宿主数据缺失、目标过期与失败路径。运行官方打包工具，区分离线验证与 Resolve 测试，交付源码及安装包。'],
  ];
  return tasks.map(([id, title, task]) => ({ id, title, text: task + '\n\n' + shared[lang] }));
}
