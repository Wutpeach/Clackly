const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { workspace } = require('./fixtures');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionPythonExecutor } = require('./python');
const { parseView, parseActionResult } = require('./extensionView');

test('public Timeline Manager uses real Python for create/edit/batch and refuses project/target drift without miswrites', { timeout: 30000 }, async (t) => {
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  let modulePath;
  const executor = createExtensionPythonExecutor({ resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
    selectedBootstrap: path.resolve(__dirname, '../script-runtime/runtime/bootstrap.py'), readiness: { bridge: { modulePath, libraryPath: modulePath } } }), launcher: new RuntimeLauncher() });
  const f = workspace(t, { executePython: executor });
  modulePath = path.join(f.directory, 'fake-resolve.py'); fs.copyFileSync(path.join(__dirname, 'fixtures/view-edit-resolve.py'), modulePath);
  const envFile = path.join(f.directory, 'view-environment.json');
  const initial = { project: 'p1', timelines: { a: 'Alpha', b: 'Beta', c: 'Gamma' }, writes: [] };
  const set = value => fs.writeFileSync(envFile, JSON.stringify(value));
  const get = () => JSON.parse(fs.readFileSync(envFile, 'utf8')); set(initial);
  const archive = path.join(f.directory, 'manager.clackly');
  execFileSync('python', [path.resolve(__dirname, '../../skills/clackly-developer/scripts/package_extension.py'), path.resolve(__dirname, '../../skills/clackly-developer/examples/timeline-manager'), archive], { windowsHide: true });
  const preview = await f.manager.preview(archive); await f.manager.install(preview.token, preview.operation);
  const command = f.manager.commands()[0], record = f.manager.get(command.extensionId);
  const request = (view = {}, input = {}) => f.manager.requestView(command.id, record.revision, record, { sessionId: 'isolated', type: 'list', ...view }, input);
  const list = parseView(await request()); assert.equal(list.items.length, 3);
  const create = parseActionResult(await request({ actionId: 'create', scope: 'view' })).view;
  assert.equal(create.inputs.name.default, 'Clackly Test'); assert.deepEqual(get().writes, []);
  set({ ...initial, project: 'other' });
  await assert.rejects(request({ type: 'form', viewId: create.id, actionId: 'save', scope: 'form' }, { name: 'Created' }), /项目已关闭或切换/); assert.deepEqual(get().writes, []);
  set(initial);
  const created = parseActionResult(await request({ type: 'form', viewId: create.id, actionId: 'save', scope: 'form' }, { name: 'Created' }));
  assert.equal(created.view.items.length, 4); assert.equal(get().writes[0].kind, 'create');
  const itemId = list.items[0].id;
  const edit = parseActionResult(await request({ actionId: 'edit', itemId, scope: 'item' })).view; assert.equal(edit.inputs.name.default, 'Alpha');
  await request({ type: 'form', viewId: 'edit', actionId: 'save', itemId, scope: 'form' }, { name: 'Renamed' });
  assert.equal(get().timelines.a, 'Renamed');
  await assert.rejects(request({ type: 'form', viewId: 'edit', actionId: 'save', itemId, scope: 'form' }, { name: 'Wrong' }), /名称已变化/);
  assert.equal(get().writes.length, 2);
  for (const changed of [{ ...initial, timelines: { b: 'Alpha', c: 'Gamma' } }, { ...initial, project: 'p2' }]) {
    set(changed); await assert.rejects(request({ actionId: 'edit', itemId, scope: 'item' }), /已删除|已关闭或切换/); assert.deepEqual(get().writes, []);
  }
  for (const failIds of [[], ['b'], ['a', 'b', 'c']]) {
    set({ ...initial, failIds });
    const result = parseActionResult(await request({ actionId: 'prefix', scope: 'batch', itemIds: list.items.map(item => item.id) }));
    assert.equal(result.summary.succeeded, 3 - failIds.length); assert.equal(result.summary.failed, failIds.length);
    assert.equal(get().writes.length, 3 - failIds.length);
    for (const id of failIds) assert.equal(get().timelines[id], initial.timelines[id]);
    for (const failure of result.summary.errors) assert.match(failure.message, /拒绝重命名/);
  }
  set({ ...initial, failCreate: true }); await assert.rejects(request({ type: 'form', viewId: create.id, actionId: 'save', scope: 'form' }, { name: 'Failed' }), /未能创建/);
  assert.deepEqual(get().writes, []);
  set({ ...initial, throwIds: ['b'] });
  const thrown = parseActionResult(await request({ actionId: 'prefix', scope: 'batch', itemIds: list.items.map(item => item.id) }));
  assert.equal(thrown.summary.failed, 1); assert.equal(thrown.summary.succeeded, 2); assert.match(thrown.summary.errors[0].message, /API exception/);
  await assert.rejects(request({ type: 'form', viewId: create.id, actionId: 'save', scope: 'form' }, { name: ' ' }), /非空字符/);
  // Exercise the widened, Unicode-safe batch context boundary through real Python.
  set(initial); const missing = Array.from({ length: 100 }, (_, i) => JSON.stringify(['p1', '不存在'.repeat(40) + i, 'name']));
  const bounded = parseActionResult(await request({ actionId: 'prefix', scope: 'batch', itemIds: missing })); assert.equal(bounded.summary.failed, 100);
  assert.deepEqual(get().writes, []);
});
