const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SKILL_FILES, createDeveloperSkill, registerDeveloperSkillIpc } = require('./developerSkill');
const { verifyDeveloperSkill } = require('../../scripts/verify-package');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-bundled-skill-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'skills/clackly-developer');
  fs.cpSync(path.resolve(__dirname, '../../../skills/clackly-developer'), directory, { recursive: true,
    filter: (file) => !file.split(path.sep).includes('__pycache__') && !/[.](?:pyc|pyo)$/.test(file) });
  let text = '', opened;
  const clipboard = { writeText(value) { text = value; }, readText: () => text };
  const options = { appRoot: root, clipboard, shell: { openPath: async (value) => { opened = value; return ''; } }, getLocale: () => 'zh-CN' };
  return { root, directory, clipboard, options, read: () => text, opened: () => opened };
}

test('bundled Skill copies a localized prompt with its actual absolute path and opens only its own folder', async (t) => {
  const f = fixture(t), skill = createDeveloperSkill(f.options);
  assert.deepEqual(skill.getState(), { available: true, directory: f.directory });
  skill.copy();
  assert.equal(JSON.parse(f.read().split('\n')[1]), f.directory);
  assert.match(f.read(), /同名.*比较/);
  assert.match(f.read(), /明确同意/);
  assert.match(f.read(), /references、examples、scripts/);
  assert.match(f.read(), /云端或隔离环境/);
  await skill.open('C:/untrusted');
  assert.equal(f.opened(), f.directory);
  createDeveloperSkill({ ...f.options, getLocale: () => 'en' }).copy();
  assert.match(f.read(), /explicit consent/);
});

test('missing, unreadable or empty resources never copy a fictitious path or open a folder', async (t) => {
  const f = fixture(t), skill = createDeveloperSkill(f.options);
  fs.unlinkSync(path.join(f.directory, 'examples/timeline-manager/timelines.py'));
  assert.deepEqual(skill.getState(), { available: false });
  assert.throws(() => skill.copy(), /unavailable/);
  await assert.rejects(skill.open(), /unavailable/);
  assert.equal(f.read(), ''); assert.equal(f.opened(), undefined);
  fs.writeFileSync(path.join(f.directory, 'examples/timeline-manager/timelines.py'), '');
  assert.equal(skill.getState().available, false);
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    if (file === path.join(f.directory, 'SKILL.md')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    return original(file, ...args);
  });
  assert.equal(skill.getState().available, false);
  assert.throws(() => skill.copy(), /unavailable/);
});

test('clipboard and folder failures propagate instead of reporting success', async (t) => {
  const f = fixture(t);
  f.clipboard.readText = () => '';
  assert.throws(() => createDeveloperSkill(f.options).copy(), /Clipboard/);
  f.options.shell.openPath = async () => 'Access denied';
  await assert.rejects(createDeveloperSkill(f.options).open(), /Cannot open/);
});

test('only the Settings main frame may access Skill operations and no renderer path is accepted', (t) => {
  const f = fixture(t), handlers = new Map(), frame = {};
  const webContents = { mainFrame: frame, isDestroyed: () => false };
  registerDeveloperSkillIpc({ ...f.options, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    getSettingsWindow: () => ({ webContents, isDestroyed: () => false }) });
  const trusted = { sender: webContents, senderFrame: frame };
  assert.equal(handlers.get('developer-skill:get')(trusted).available, true);
  for (const handler of handlers.values()) {
    assert.throws(() => handler({ sender: {}, senderFrame: frame }), /rejected/);
    assert.throws(() => handler({ sender: webContents, senderFrame: {} }), /rejected/);
    assert.throws(() => handler(trusted, 'C:/untrusted'), /rejected/);
  }
});

test('package verification rejects incomplete or stale Skill resources', (t) => {
  const f = fixture(t), appRoot = path.resolve(__dirname, '../..');
  verifyDeveloperSkill(appRoot, f.root);
  fs.writeFileSync(path.join(f.directory, 'README.md'), 'old');
  assert.throws(() => verifyDeveloperSkill(appRoot, f.root), /differs from source/);
  fs.unlinkSync(path.join(f.directory, SKILL_FILES.at(-1)));
  assert.throws(() => verifyDeveloperSkill(appRoot, f.root), /inventory differs/);
});
