const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { workspace } = require('./fixtures');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionPythonExecutor } = require('./python');
const { parseView, parseActionResult } = require('./extensionView');

test('installed public marker browser uses short-lived Python View/Action, rejects stale objects and bounds failures/timeouts', { timeout: 35000 }, async (t) => {
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  let modulePath;
  const executor = createExtensionPythonExecutor({ resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
    selectedBootstrap: path.resolve(__dirname, '../script-runtime/runtime/bootstrap.py'), readiness: { bridge: { modulePath, libraryPath: modulePath } } }), launcher: new RuntimeLauncher() });
  const f = workspace(t, { executePython: executor });
  modulePath = path.join(f.directory, 'fake-resolve.py'); fs.copyFileSync(path.join(__dirname, 'fixtures/view-resolve.py'), modulePath);
  const envFile = path.join(f.directory, 'view-environment.json');
  const environment = { project: 'p1', timeline: 't1', markers: { 24: { name: '同名标记', note: 'Read only <b>text</b>', color: 'Blue', duration: 1 }, 48: { name: '同名标记', color: 'Red', duration: 2 } } };
  const set = (value) => fs.writeFileSync(envFile, JSON.stringify(value)); set(environment);
  const archive = path.join(f.directory, 'browser.clackly');
  execFileSync('python', [path.resolve(__dirname, '../../skills/clackly-developer/scripts/package_extension.py'), path.resolve(__dirname, '../../skills/clackly-developer/examples/marker-browser'), archive], { windowsHide: true });
  const preview = await f.manager.preview(archive); await f.manager.install(preview.token, preview.operation);
  const command = f.manager.commands()[0], record = f.manager.get(command.extensionId), revision = record.revision;
  const request = (patch = {}) => f.manager.requestView(command.id, revision, record, { sessionId: 'isolated', type: 'list', ...patch });
  await assert.rejects(f.manager.execute(command), /Open View/);
  const list = parseView(await request()); assert.equal(list.items.length, 2); assert.notEqual(list.items[0].id, list.items[1].id);
  const detail = parseView(await request({ type: 'detail', itemId: list.items[0].id })); assert.match(detail.text, /Read only/);
  const result = parseActionResult(await request({ actionId: 'verify', itemId: list.items[0].id })); assert.equal(result.effect, 'keep');
  for (const changed of [{ ...environment, markers: {} }, { ...environment, timeline: 't2' }, { ...environment, project: 'p2' }]) {
    set(changed); await assert.rejects(request({ actionId: 'verify', itemId: list.items[0].id }), /已删除|已切换/);
  }
  for (const empty of [{ ...environment, markers: {} }, { ...environment, project: null }, { ...environment, timeline: null }]) {
    set(empty); assert.equal(parseView(await request()).items.length, 0);
  }
  set({ ...environment, mode: 'failed' }); await assert.rejects(request(), /bridge is unavailable/);
  set({ ...environment, mode: 'timeout' }); await assert.rejects(request(), /RUNTIME_TIMEOUT/);
  set(environment); assert.equal(parseView(await request()).items.length, 2);
});
