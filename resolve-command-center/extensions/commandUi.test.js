const test = require('node:test');
const assert = require('node:assert/strict');
const { validateManifest } = require('./package');
const { validateCommandUi, validateInput, parseUiResult } = require('./commandUi');
const { workspace, manifest } = require('./fixtures');

const ui = { version: 1, inputs: {
  title: { type: 'string', label: 'Title', required: true }, notes: { type: 'text', label: 'Notes' },
  count: { type: 'number', label: 'Count', min: 1, max: 5, default: 2 },
  enabled: { type: 'boolean', label: 'Enabled', required: true },
  mode: { type: 'select', label: 'Mode', options: ['A', 'B'] },
  color: { type: 'color', label: 'Color' }, file: { type: 'path', label: 'File' }, folder: { type: 'folder', label: 'Folder' }
}, confirm: { message: 'Create report?' } };
test('manifest retains bounded static input and rejects malformed UI before installation', () => {
  const value = manifest(); value.commands[0].ui = ui;
  assert.deepEqual(validateManifest(value).commands[0].ui, ui);
  const bad = [ { ...ui, version: 2 }, { ...ui, prepare: 'load' }, { version: 1 },
    { ...ui, confirm: { message: '' } }, { ...ui, inputs: { count: { ...ui.inputs.count, default: 9 } } },
    { ...ui, inputs: { ...ui.inputs, title: { ...ui.inputs.title, type: 'html' } } },
    { ...ui, inputs: { prototype: { type: 'string', label: 'Bad' } } },
    { ...ui, inputs: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['field' + i, ui.inputs.title])) },
    { ...ui, inputs: { count: { ...ui.inputs.count, min: 10 } } } ];
  for (const candidate of bad) assert.throws(() => validateCommandUi(candidate));
});
test('host validates typed values, false booleans, empty required fields and all data limits', () => {
  const values = { title: 'Review', notes: 'Two\nlines', count: 1.5, enabled: false, mode: 'B', color: '#63c174', file: 'C:/a.txt', folder: 'C:/out' };
  assert.deepEqual(validateInput(ui.inputs, values), values);
  for (const patch of [{ title: '' }, { title: ' ' }, { title: 'a'.repeat(8193) }, { count: 0 }, { count: Infinity },
    { enabled: 'false' }, { mode: 'C' }, { color: 'red' }, { injected: 'x' }]) {
    assert.throws(() => validateInput(ui.inputs, { ...values, ...patch }));
  }
});
test('only explicit versioned result envelopes produce UI and malformed explicit data fails', () => {
  for (const value of [null, 'OK', { message: 'success', items: ['old'] }, { status: 'error' }]) assert.equal(parseUiResult(value), null);
  const value = { $clackly: 'result', version: 1, status: 'success', message: '<script>literal</script>', fields: [{ label: 'Count', value: '2' }], items: ['A'], text: 'Summary' };
  assert.deepEqual(parseUiResult(value), value);
  for (const patch of [{ version: 2 }, { status: 'running' }, { message: '' }, { html: '<h1>no</h1>' },
    { text: 'a'.repeat(32769) }, { fields: [{ label: 'Object', value: {} }] }, { items: Array(101).fill('a') }]) {
    assert.throws(() => parseUiResult({ ...value, ...patch }));
  }
});
test('input and confirmation gates stop execution; config stays separate and an updated revision cannot inherit consent', async (t) => {
  const requests = [];
  const { manager, pack } = workspace(t, { executePython: async (request) => { requests.push(request); return { ok: true, result: {} }; } });
  const value = manifest(); value.commands[0].ui = ui;
  const preview = await manager.preview(pack(value)); await manager.install(preview.token, preview.operation);
  manager.saveConfig('test.tools', { label: 'saved' });
  const command = manager.commands()[0]; const before = manager.describeCommand(command.id);
  const execution = { revision: before.revision, confirmed: true, input: { title: 'one run', count: 2, enabled: false } };
  await assert.rejects(manager.execute(command), { code: 'EXTENSION_CONFIRMATION_REQUIRED' });
  await assert.rejects(manager.execute(command, { ...execution, confirmed: false }));
  await assert.rejects(manager.execute(command, { ...execution, input: { ...execution.input, count: 10 } }));
  assert.equal(requests.length, 0);
  await manager.execute(command, execution);
  assert.deepEqual(requests[0].config, { label: 'saved' }); assert.deepEqual(requests[0].input, execution.input);
  assert.deepEqual(manager.list()[0].values, { label: 'saved' });
  const update = await manager.preview(pack({ ...value, version: '1.1.0' })); await manager.install(update.token, update.operation);
  await assert.rejects(manager.execute(command, execution), { code: 'EXTENSION_STALE_COMMAND' });
  assert.equal(requests.length, 1);
});

test('structured business failures and malformed UI results cannot enter successful Recent history', async (t) => {
  const { createCommandExecutor } = require('../command-engine/executor');
  const { manager, pack } = workspace(t); const preview = await manager.preview(pack(manifest({ configSchema: {} })));
  await manager.install(preview.token, preview.operation);
  const history = [];
  const execute = createCommandExecutor({ findCommand: () => manager.commands()[0],
    capabilityRegistry: { get: () => ({ execute: (command, execution) => manager.execute(command, execution) }) },
    configManager: { assertConfigured() {}, forCapability: () => ({}) }, usageHistory: { record: (id) => history.push(id) } });
  manager.executePython = async () => ({ result: { $clackly: 'result', version: 1, status: 'error', message: 'No matching entries' } });
  await assert.rejects(execute(manager.commands()[0].id), { code: 'EXTENSION_RESULT_ERROR' });
  manager.executePython = async () => ({ result: { $clackly: 'result', version: 2 } });
  await assert.rejects(execute(manager.commands()[0].id), { code: 'EXTENSION_UI_INVALID' });
  assert.deepEqual(history, []);
});
