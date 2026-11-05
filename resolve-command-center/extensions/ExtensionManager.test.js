const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ExtensionManager } = require('./ExtensionManager');
const { readPackage } = require('./package');
const { manifest, workspace } = require('./fixtures');
const { zipBuffer } = require('../electron/main/update/fixtures');

test('runtime readiness blocks Palette availability until a real check succeeds and recovers without reinstall', async (t) => {
  let available = false;
  const { manager, install } = workspace(t, { checkAvailability: async () => {
    if (!available) throw Object.assign(new Error('offline'), { code: 'RESOLVE_NOT_RUNNING' });
    return { ok: true };
  } });
  await install(manifest({ configSchema: {} }));
  assert.equal(manager.commands()[0].featureStatus.status, 'unavailable');
  assert.equal(manager.list()[0].runtimeError, 'RESOLVE_NOT_RUNNING');
  available = true;
  await manager.refreshAvailability();
  assert.equal(manager.commands()[0].featureStatus.status, 'ready');
});

test('a cleanup error after committing an installation cannot remove its active files', async (t) => {
  const { manager, install } = workspace(t);
  const original = fs.unlinkSync;
  try {
    fs.unlinkSync = (file) => {
      if (file === path.join(manager.root, 'state.lock')) throw new Error('fixture cleanup error');
      return original(file);
    };
    await install(manifest({ configSchema: {} }));
  } finally { fs.unlinkSync = original; }
  assert.equal(manager.list()[0].version, '1.0.0');
  assert.equal((await manager.execute(manager.commands()[0])).ok, true);
});

test('install, stable IDs, configuration, replace/update/downgrade, disable and uninstall survive restart', async (t) => {
  const { manager, pack, install } = workspace(t);
  assert.equal((await install()).operation, 'install');
  assert.equal(manager.list()[0].status, 'needs-setup');
  await assert.rejects(manager.execute(manager.commands()[0]), { code: 'EXTENSION_NEEDS_SETUP' });
  manager.saveConfig('test.tools', { label: 'Keep me' });
  const id = manager.commands()[0].id;
  assert.deepEqual((await manager.execute(manager.commands()[0])).result, { label: 'Keep me' });
  for (const [version, expected] of [['1.0.0', 'replace'], ['2.0.0', 'update'], ['0.9.0', 'downgrade']]) {
    const preview = await manager.preview(pack(manifest({ version, name: 'Renamed', commands: [{ id: 'inspect', name: 'Renamed Command', entry: 'inspect.py' }] })));
    assert.equal(preview.operation, expected);
    await assert.rejects(manager.install(preview.token, 'install'), { code: 'EXTENSION_CONFIRMATION_REQUIRED' });
    await manager.install(preview.token, expected);
    assert.equal(manager.commands()[0].id, id);
    assert.equal(manager.list()[0].values.label, 'Keep me');
  }
  await manager.setEnabled('test.tools', false);
  assert.equal(manager.commands()[0].featureStatus.enabled, false);
  await assert.rejects(manager.execute(manager.commands()[0]), { code: 'EXTENSION_DISABLED' });
  const restarted = new ExtensionManager({ root: manager.root });
  assert.equal(restarted.list()[0].enabled, false);
  await manager.setEnabled('test.tools', true);
  await manager.uninstall('test.tools', false);
  assert.deepEqual(manager.commands(), []);
  await install();
  assert.deepEqual(manager.list()[0].values, { label: 'Keep me' });
  await manager.uninstall('test.tools', true);
  await install();
  assert.deepEqual(manager.list()[0].values, {});
});

test('schema migration retains compatible values, excludes changed types/options and flags new required fields', async (t) => {
  const { manager, install } = workspace(t);
  await install(manifest({ configSchema: { label: { type: 'string' }, mode: { type: 'select', options: ['a', 'b'] }, removed: { type: 'number' } } }));
  manager.saveConfig('test.tools', { label: 'saved', mode: 'a', removed: 42 });
  await install(manifest({ version: '2.0.0', configSchema: { label: { type: 'string' }, mode: { type: 'select', options: ['b'] }, added: { type: 'string', required: true } } }));
  assert.deepEqual(manager.list()[0].values, { label: 'saved' });
  assert.deepEqual(manager.list()[0].missing, ['added']);
  await assert.rejects(manager.execute(manager.commands()[0]), { code: 'EXTENSION_NEEDS_SETUP' });
  manager.saveConfig('test.tools', { label: 'saved', added: 'new', mode: 'b' });
  assert.deepEqual((await manager.execute(manager.commands()[0])).result, { label: 'saved', added: 'new', mode: 'b' });
  await install(manifest({ version: '3.0.0', configSchema: { label: { type: 'number', required: true } } }));
  assert.deepEqual(manager.list()[0].values, {});
  assert.equal(manager.list()[0].status, 'needs-setup');
});

test('update waits for an executing command, rejects new starts and does not interrupt the old script', async (t) => {
  let finish;
  const { manager, pack, install } = workspace(t, { executePython: () => new Promise((resolve) => { finish = resolve; }) });
  await install(manifest({ configSchema: {} }));
  const oldRoot = manager.revisionPath('test.tools', manager.get('test.tools'));
  const running = manager.execute(manager.commands()[0]);
  await Promise.resolve();
  const preview = await manager.preview(pack(manifest({ version: '2.0.0', configSchema: {} })));
  const updating = manager.install(preview.token, preview.operation);
  await assert.rejects(manager.execute(manager.commands()[0]), { code: 'EXTENSION_BUSY' });
  assert.equal(manager.list()[0].version, '1.0.0');
  assert.equal(fs.existsSync(oldRoot), true);
  assert.equal(manager.commands()[0].featureStatus.status, 'loading');
  finish({ ok: true }); await running; await updating;
  assert.equal(manager.list()[0].version, '2.0.0');
  assert.equal(fs.existsSync(oldRoot), false);
});

test('invalid archives, entry/ID collisions, links and CRC errors preserve the usable installation', async (t) => {
  const { manager, pack, install } = workspace(t);
  await install(); manager.saveConfig('test.tools', { label: 'safe' });
  const state = fs.readFileSync(manager.statePath, 'utf8');
  for (const attack of [['../escape.py', 'x'], ['C:/escape.py', 'x'], ['a:b', 'x'], ['NUL.txt', 'x'],
    ['link', 'x', { attributes: 0xa1ff0000 }], ['encrypted', 'x', { flags: 1 }], ['INSPECT.py', 'x'],
    ['a/b.py', 'x'], ['a', 'file'], ['huge', 'x', { uncompressedSize: 9 * 1024 * 1024 }]]) {
    const additions = attack[0] === 'a' ? [['a/b.py', 'x'], attack] : [attack];
    if (attack[0] === 'a/b.py') continue;
    await assert.rejects(manager.preview(pack(manifest(), additions)));
    assert.equal(fs.readFileSync(manager.statePath, 'utf8'), state);
  }
  for (const value of [manifest({ id: '../escape' }), manifest({ commands: [{ id: 'same', name: 'A', entry: 'inspect.py' }, { id: 'same', name: 'B', entry: 'inspect.py' }] }),
    manifest({ commands: [{ id: 'missing', name: 'Missing', entry: 'missing.py' }] }), manifest({ version: 'v1.0.0' })]) {
    await assert.rejects(manager.preview(pack(value)));
  }
  const file = pack(); const bytes = fs.readFileSync(file);
  const at = bytes.indexOf(Buffer.from('def execute')); bytes[at] = 0x78; fs.writeFileSync(file, bytes);
  await assert.rejects(readPackage(file), { code: 'EXTENSION_INVALID_PACKAGE' });
  assert.equal(fs.readFileSync(manager.statePath, 'utf8'), state);
});

test('staged-file changes, pointer-write failure and a second writer cannot destroy the old version or config', async (t) => {
  const { manager, pack, install } = workspace(t);
  await install(); manager.saveConfig('test.tools', { label: 'safe' });
  const preview = await manager.preview(pack(manifest({ version: '2.0.0' })));
  fs.appendFileSync(path.join(manager.previews.get(preview.token).stage, 'inspect.py'), '# tamper');
  await assert.rejects(manager.install(preview.token, preview.operation), { code: 'EXTENSION_FILES_CHANGED' });
  const next = await manager.preview(pack(manifest({ version: '2.0.0' })));
  const lock = path.join(manager.root, 'state.lock'); fs.writeFileSync(lock, 'locked');
  await assert.rejects(manager.install(next.token, next.operation), { code: 'EXTENSION_STATE_BUSY' });
  fs.unlinkSync(lock);
  assert.equal(manager.list()[0].version, '1.0.0');
  assert.equal((await manager.execute(manager.commands()[0])).result.label, 'safe');
  const other = new ExtensionManager({ root: manager.root });
  manager.saveConfig('test.tools', { label: 'new' });
  assert.throws(() => other.saveConfig('test.tools', { label: 'stale' }), { code: 'EXTENSION_STATE_CHANGED' });
  assert.equal(JSON.parse(fs.readFileSync(manager.statePath))['test.tools'].config.label, 'new');
});

test('managed path links are rejected and broken extension state leaves built-in search available', async (t) => {
  const { manager, directory, install } = workspace(t);
  await install();
  const outside = path.join(directory, 'outside'); fs.mkdirSync(outside);
  manager.saveConfig('test.tools', { label: 'safe' });
  const cache = manager.pythonCachePath('test.tools', manager.get('test.tools'));
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.symlinkSync(outside, cache, 'junction');
  await assert.rejects(manager.execute(manager.commands()[0]), { code: 'EXTENSION_UNSAFE_PATH' });
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(cache);
  const stage = path.join(manager.root, 'staging'); fs.rmSync(stage, { recursive: true });
  fs.symlinkSync(outside, stage, 'junction');
  await assert.rejects(manager.preview(path.join(directory, 'test.clackly')), { code: 'EXTENSION_UNSAFE_PATH' });
  fs.unlinkSync(stage);
  fs.writeFileSync(manager.statePath, '{broken');
  const broken = new ExtensionManager({ root: manager.root });
  assert.deepEqual(broken.commands(), []);
  assert.throws(() => broken.list(), { code: 'EXTENSION_STATE_INVALID' });
});
