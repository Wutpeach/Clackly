const fs = require('node:fs');
const path = require('node:path');

const SKILL_FILES = [
  'SKILL.md', 'README.md', 'README.zh-CN.md', 'scripts/package_extension.py',
  ...['extension-v1', 'command-ui', 'prepare', 'views'].map((name) => 'references/' + name + '.md'),
  ...[['inspect-project', 'inspect.py'], ['run-summary', 'summary.py'],
    ['timeline-summary', 'report.py'], ['marker-browser', 'markers.py'],
    ['timeline-manager', 'timelines.py']].flatMap(([name, entry]) =>
    ['examples/' + name + '/manifest.json', 'examples/' + name + '/' + entry]),
  'examples/timeline-manager/README.md'
];

function installationPrompt(directory, locale) {
  return (locale === 'zh-CN' ? [
    '请帮我安装或更新 Clackly Developer Skill。完整源目录的实际绝对路径为：',
    JSON.stringify(directory), '',
    '先检查你能否读取这个本机目录及其中的 SKILL.md，并阅读入口说明。识别你当前实际使用的 Agent/Harness 及其支持的 Skill 安装目录或导入方式；不要猜测其他客户端的路径。按该方式复制或导入完整 clackly-developer 目录，包括 README、references、examples、scripts，不能只安装 SKILL.md。', '',
    '若已有同名 Skill，先比较两份内容并报告差异；内容相同则验证现有安装即可，替换或覆盖前必须取得我的明确同意，保留其他 Skill 和配置。', '',
    '完成后校验目录及所需文件完整、客户端可以识别和使用 Skill，并说明是否需要新开或重启会话；只有得到证据才报告安装成功。Clackly 升级只更新随应用提供的源目录，不会自动同步已导入的副本。', '',
    '如果你是云端或隔离环境，无法访问这个本机目录，或目录/文件缺失、权限不足，请如实说明并停止安装，让我提供完整目录或 ZIP；我可以在 Clackly Settings → 扩展中打开 Skill 文件夹后手动压缩分享。不得虚构安装成功。'
  ] : [
    'Please install or update the Clackly Developer Skill. The actual absolute path to the complete source folder is:',
    JSON.stringify(directory), '',
    'First check that you can read this local folder and its SKILL.md, then read the entry instructions. Identify your actual Agent/Harness and its supported Skill directory or import workflow; do not guess paths for other clients. Copy or import the entire clackly-developer folder, including README files, references, examples and scripts, rather than only SKILL.md.', '',
    'If a Skill with the same name exists, compare the contents and report differences first. If identical, verify the existing installation. Obtain my explicit consent before replacing or overwriting it; preserve other Skills and configuration.', '',
    'Verify all required files and that the client can discover and use the Skill. Explain whether a new or restarted session is needed. Report success only with evidence. Clackly upgrades update only the bundled source; imported copies do not sync automatically.', '',
    'If you are in a cloud or isolated environment and cannot access this local folder, or files are missing or unreadable, explain the problem and stop installation. Ask me to provide the complete folder or ZIP; I can open the Skill folder in Clackly Settings → Extensions and compress it manually. Never invent installation success.'
  ]).join('\n');
}

function createDeveloperSkill({ appRoot, clipboard, shell, getLocale = () => 'en' }) {
  const directory = path.resolve(appRoot, 'skills/clackly-developer');
  function getState() {
    try {
      for (const file of SKILL_FILES) {
        if (!fs.statSync(path.join(directory, file)).isFile() || !fs.readFileSync(path.join(directory, file)).length) throw new Error('Incomplete Skill');
      }
      return { available: true, directory };
    } catch { return { available: false }; }
  }
  function requireAvailable() {
    if (!getState().available) throw new Error('Developer Skill unavailable');
  }
  return { getState,
    copy() {
      requireAvailable();
      const text = installationPrompt(directory, getLocale());
      clipboard.writeText(text);
      if (clipboard.readText() !== text) throw new Error('Clipboard unavailable');
    },
    async open() {
      requireAvailable();
      if (await shell.openPath(directory)) throw new Error('Cannot open Skill folder');
    }
  };
}

function registerDeveloperSkillIpc({ ipcMain, getSettingsWindow, ...options }) {
  const skill = createDeveloperSkill(options);
  for (const [channel, action] of Object.entries({
    'developer-skill:get': skill.getState, 'developer-skill:copy': skill.copy, 'developer-skill:open': skill.open
  })) {
    ipcMain.handle(channel, (event, ...args) => {
      const window = getSettingsWindow(), contents = window?.webContents;
      if (!window || window.isDestroyed() || !contents || contents.isDestroyed()
        || event?.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame
        || args.length) throw new Error('Developer Skill request rejected');
      return action();
    });
  }
}
module.exports = { SKILL_FILES, installationPrompt, createDeveloperSkill, registerDeveloperSkillIpc };
