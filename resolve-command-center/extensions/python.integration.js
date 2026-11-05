const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionPythonExecutor } = require('./python');
const { ExtensionManager } = require('./ExtensionManager');
const { workspace, manifest } = require('./fixtures');

test('a real isolated Python worker executes an installed package with filtered config and reports script failure', async (t) => {
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  const { manager, pack } = workspace(t);
  manager.executePython = createExtensionPythonExecutor({
    resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
      selectedBootstrap: path.resolve(__dirname, '../script-runtime/runtime/bootstrap.py'), readiness: {} }),
    launcher: new RuntimeLauncher()
  });
  let preview = await manager.preview(pack()); await manager.install(preview.token, preview.operation);
  manager.saveConfig('test.tools', { label: '真实 Python' });
  const result = await manager.execute(manager.commands()[0]);
  assert.deepEqual(result.result, { label: '真实 Python', command: 'extension:test.tools/inspect' });
  preview = await manager.preview(pack(manifest(), [], 'def execute(context):\n    raise ValueError("fixture failure")\n'));
  await manager.install(preview.token, preview.operation);
  await assert.rejects(manager.execute(manager.commands()[0]), { code: 'EXTENSION_SCRIPT_FAILED' });
});

test('an installed extension reuses external bytecode after config edits and restart, rebuilds deleted cache and keeps file integrity', async (t) => {
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  const { manager, pack } = workspace(t);
  const executePython = createExtensionPythonExecutor({
    resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
      selectedBootstrap: path.resolve(__dirname, '../script-runtime/runtime/bootstrap.py'), readiness: {} }),
    launcher: new RuntimeLauncher()
  });
  manager.executePython = executePython;
  const script = 'def execute(context):\n    return {"label": context.config["label"], "cache": __cached__}\n';
  const preview = await manager.preview(pack(manifest(), [['resource.txt', 'original resource']], script));
  await manager.install(preview.token, preview.operation);
  manager.saveConfig('test.tools', { label: 'before' });
  const command = manager.commands()[0];
  const first = (await manager.execute(command)).result;
  assert.equal(first.label, 'before');
  const cacheRoot = manager.pythonCachePath('test.tools', manager.get('test.tools'));
  assert.ok(first.cache.startsWith(cacheRoot + path.sep));
  assert.equal(fs.statSync(first.cache).isFile(), true);
  const cached = fs.readFileSync(first.cache);
  // A fixed timestamp proves later workers reuse the bytecode instead of rewriting it.
  fs.utimesSync(first.cache, new Date('2020-01-01'), new Date('2020-01-01'));
  const cacheTime = fs.statSync(first.cache).mtimeMs;
  manager.saveConfig('test.tools', { label: 'after' });
  assert.equal((await manager.execute(command)).result.label, 'after');
  const restarted = new ExtensionManager({ root: manager.root, executePython });
  assert.equal((await restarted.execute(restarted.commands()[0])).result.label, 'after');
  assert.deepEqual(fs.readFileSync(first.cache), cached);
  assert.equal(fs.statSync(first.cache).mtimeMs, cacheTime);
  fs.rmSync(cacheRoot, { recursive: true });
  assert.equal((await restarted.execute(restarted.commands()[0])).result.label, 'after');
  assert.equal(fs.statSync(first.cache).isFile(), true);
  const root = restarted.revisionPath('test.tools', restarted.get('test.tools'));
  assert.equal(fs.existsSync(path.join(root, '__pycache__')), false);
  assert.equal(restarted.verify('test.tools', restarted.get('test.tools')), root);
  // Real resource changes must still be rejected, with the saved configuration intact.
  fs.writeFileSync(path.join(root, 'resource.txt'), 'modified resource');
  await assert.rejects(restarted.execute(command), { code: 'EXTENSION_FILES_CHANGED' });
  assert.equal(restarted.list()[0].status, 'error');
  assert.deepEqual(restarted.values(restarted.get('test.tools')), { label: 'after' });
  const replacement = await restarted.preview(pack(manifest(), [['resource.txt', 'original resource']], script));
  assert.equal(replacement.operation, 'replace');
  await restarted.install(replacement.token, replacement.operation);
  assert.equal(fs.existsSync(cacheRoot), false);
  const replaced = (await restarted.execute(restarted.commands()[0])).result;
  assert.equal(replaced.label, 'after');
  assert.notEqual(replaced.cache, first.cache);
  const replacedRoot = restarted.pythonCachePath('test.tools', restarted.get('test.tools'));
  const update = await restarted.preview(pack(manifest({ version: '1.1.0' }), [], script));
  assert.equal(update.operation, 'update');
  await restarted.install(update.token, update.operation);
  assert.equal(fs.existsSync(replacedRoot), false);
  const updated = (await restarted.execute(restarted.commands()[0])).result;
  assert.equal(updated.label, 'after');
  assert.notEqual(updated.cache, replaced.cache);
  const updatedRoot = restarted.pythonCachePath('test.tools', restarted.get('test.tools'));
  await restarted.uninstall('test.tools', false);
  assert.equal(fs.existsSync(updatedRoot), false);
  const reinstalled = await restarted.preview(pack());
  await restarted.install(reinstalled.token, reinstalled.operation);
  assert.deepEqual(restarted.list()[0].values, { label: 'after' });
});
