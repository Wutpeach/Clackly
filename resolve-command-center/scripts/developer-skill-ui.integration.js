const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

test('bundled Settings: English/Chinese, keyboard copy, folder dispatch and recoverable errors through real preload/IPC', { timeout: 90000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-skill-ui-'));
  const appRoot = process.env.CLACKLY_SKILL_TEST_APP || path.resolve(__dirname, '..');
  const resourceRoot = process.env.CLACKLY_SKILL_TEST_APP ? appRoot : path.join(root, 'resources');
  if (!process.env.CLACKLY_SKILL_TEST_APP) fs.cpSync(path.resolve(__dirname, '../../skills/clackly-developer'),
    path.join(resourceRoot, 'skills/clackly-developer'), { recursive: true,
      filter: (file) => !file.split(path.sep).includes('__pycache__') && !/[.](?:pyc|pyo)$/.test(file) });
  const evidence = path.resolve(__dirname, '../build/issue10'); fs.mkdirSync(evidence, { recursive: true });
  const screenshot = async (name) => {
    const bytes = await app.evaluate(async () => (await global.skillTest.window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
    fs.writeFileSync(path.join(evidence, name), Buffer.from(bytes, 'base64'));
  };
  const env = { ...process.env, CLACKLY_SKILL_TEST_ROOT: root, CLACKLY_SKILL_TEST_APP: appRoot,
    CLACKLY_SKILL_TEST_RESOURCES: resourceRoot }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.join(__dirname, 'developer-skill-electron-fixture.js')], env });
  let oldClipboard;
  try {
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('button', { name: 'Extensions', exact: true }).click();
    const copy = page.getByRole('button', { name: 'Copy Agent installation prompt', exact: true });
    await copy.waitFor(); await page.waitForFunction(() => !document.querySelector('.developer-skill-section .primary-button').disabled);
    oldClipboard = await app.evaluate(() => global.skillTest.clipboard.readText());
    await copy.focus(); await page.keyboard.press('Enter');
    await page.getByText('Prompt copied. Paste it into your local AI Agent to continue.', { exact: true }).waitFor();
    const prompt = await app.evaluate(() => global.skillTest.clipboard.readText());
    assert.equal(JSON.parse(prompt.split('\n')[1]), path.join(resourceRoot, 'skills/clackly-developer'));
    fs.writeFileSync(path.join(evidence, 'agent-install-prompt-en.txt'), prompt);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Open Skill folder', exact: true }).evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.getByText(/Skill folder opened/).waitFor();
    assert.equal(await app.evaluate(() => global.skillTest.opened()), path.join(resourceRoot, 'skills/clackly-developer'));
    await screenshot('settings-en.png');
    await app.evaluate(() => global.skillTest.locale('zh-CN'));
    const zhCopy = page.getByRole('button', { name: '复制 Agent 安装提示词', exact: true });
    await zhCopy.click(); await page.getByText('提示词已复制。粘贴给本地 AI Agent，继续安装。', { exact: true }).waitFor();
    fs.writeFileSync(path.join(evidence, 'agent-install-prompt-zh-CN.txt'), await app.evaluate(() => global.skillTest.clipboard.readText()));
    await screenshot('settings-zh-CN.png');
    await app.evaluate(() => global.skillTest.window.setContentSize(640, 560));
    assert.equal(await zhCopy.isVisible(), true);
    assert.equal(await page.getByRole('button', { name: '打开 Skill 文件夹' }).isVisible(), true);
    await screenshot('settings-compact-zh-CN.png');
    await app.evaluate(() => global.skillTest.window.setContentSize(760, 560));
    await app.evaluate(() => global.skillTest.fail('copy'));
    await zhCopy.click(); await page.getByRole('alert').filter({ hasText: '未能复制提示词' }).waitFor();
    assert.equal(await zhCopy.isEnabled(), true);
    await app.evaluate(() => global.skillTest.fail('open'));
    await page.getByRole('button', { name: '打开 Skill 文件夹', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '未能打开 Skill 文件夹' }).waitFor();
    await screenshot('settings-error-zh-CN.png');
    await app.evaluate(() => global.skillTest.fail(''));
    await zhCopy.click(); await page.getByText('提示词已复制。粘贴给本地 AI Agent，继续安装。', { exact: true }).waitFor();
    // Move a bundled file only inside a temporary copy; the real package stays intact.
    const missingRoot = path.join(root, 'missing'); fs.mkdirSync(missingRoot);
    fs.cpSync(path.join(resourceRoot, 'skills'), path.join(missingRoot, 'skills'), { recursive: true });
    fs.unlinkSync(path.join(missingRoot, 'skills/clackly-developer/references/views.md'));
    await app.evaluate((_electron, value) => global.skillTest.missing(value), missingRoot);
    await page.reload(); await page.getByRole('button', { name: '扩展', exact: true }).click();
    await page.getByText(/随包 Skill 缺失或无法读取/).waitFor();
    assert.equal(await page.getByRole('button', { name: '复制 Agent 安装提示词' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '打开 Skill 文件夹' }).isDisabled(), true);
    await screenshot('settings-missing-zh-CN.png');
    assert.deepEqual(errors, []);
  } finally {
    if (oldClipboard !== undefined) await app.evaluate((_electron, value) => global.skillTest.clipboard.writeText(value), oldClipboard).catch(() => {});
    await app.close();
    if (!root.startsWith(path.join(os.tmpdir(), 'clackly-skill-ui-'))) throw new Error('Unsafe test cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
