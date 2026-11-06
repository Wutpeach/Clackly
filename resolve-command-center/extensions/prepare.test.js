const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCommandUi, applyPrepare, refreshValues, validateInput } = require('./commandUi');
const { manifest, workspace } = require('./fixtures');
const ui = { version: 2, prepare: true, inputs: {
  target: { type: 'select', label: 'Target', dynamic: true, required: true },
  title: { type: 'string', label: 'Title', default: 'Report' },
  flag: { type: 'boolean', label: 'Flag' },
  count: { type: 'number', label: 'Count', min: 1, max: 5 }
} };
const response = (ids = ['a', 'b']) => ({ $clackly: 'prepare', version: 1,
  options: { target: ids.map((value) => ({ label: 'Same name', value })) },
  defaults: ids.length ? { target: ids[0], title: 'Prepared report' } : {} });

test('versioned manifest requires explicit Prepare and a fixed dynamic select; static v1 remains separate', () => {
  assert.deepEqual(validateCommandUi(ui), ui);
  for (const bad of [{ ...ui, version: 1 }, { ...ui, prepare: false },
    { ...ui, inputs: { target: { ...ui.inputs.target, options: ['a'] } } },
    { ...ui, inputs: { target: { ...ui.inputs.target, type: 'string' } } },
    { ...ui, inputs: { target: { ...ui.inputs.target, default: 'a' } } }]) assert.throws(() => validateCommandUi(bad));
});

test('Prepare validates field whitelist, bounds, duplicate values and default membership before rendering', () => {
  const prepared = applyPrepare(ui, response());
  assert.equal(prepared.ui.inputs.target.default, 'a');
  assert.equal(prepared.empty, false);
  assert.equal(applyPrepare(ui, response([])).empty, true);
  const optional = applyPrepare({ ...ui, inputs: { target: { ...ui.inputs.target, required: false } } }, response([]));
  assert.equal(optional.empty, true); assert.equal(optional.blocked, false);
  const patches = [{ options: {} }, { html: '<h1>no</h1>' }, { version: 2 },
    { options: { unknown: [] } }, { options: { title: [] } },
    { options: { target: [{ label: 'A', value: 'a' }, { label: 'B', value: 'a' }] } },
    { options: { target: [{ label: '', value: 'a' }] } },
    { options: { target: [{ label: 'A', value: 'a', type: 'html' }] } },
    { options: { target: Array.from({ length: 101 }, (_, i) => ({ label: 'A', value: '' + i })) } },
    { defaults: { target: 'unknown' } }, { defaults: { flag: 'false' } },
    { defaults: { count: 9 } }, { defaults: { title: null } }, { defaults: { injected: 'x' } },
    { message: 'a'.repeat(2001) },
    { options: { target: Array.from({ length: 100 }, (_, i) => ({ label: 'a'.repeat(201), value: '' + i })) } }];
  for (const patch of patches) assert.throws(() => applyPrepare(ui, { ...response(), ...patch }));
  assert.throws(() => validateInput(prepared.ui.inputs, { target: 'Same name' }));
  assert.deepEqual(validateInput(prepared.ui.inputs, { target: 'b' }), { target: 'b' });
});

test('refresh keeps legal edits, false and deliberate clears; invalid old selection cannot become new default', () => {
  const next = applyPrepare(ui, response(['b', 'c'])).ui.inputs;
  const retained = refreshValues(next, { target: 'b', title: 'My title', flag: false, count: 2 }, ['title', 'flag', 'count']);
  assert.deepEqual(retained.values, { target: 'b', title: 'My title', flag: false, count: 2 });
  const removed = refreshValues(next, { target: 'a', flag: false }, ['title']);
  assert.equal(Object.hasOwn(removed.values, 'target'), false);
  assert.equal(Object.hasOwn(removed.values, 'title'), false);
  assert.deepEqual(removed.cleared, ['Target']);
  assert.throws(() => refreshValues(next, {}, ['unknown']));
});

test('only current one-use prepared candidates execute; changed configuration and installation invalidate them', async (t) => {
  const calls = [];
  const f = workspace(t, { executePython: async (request) => { calls.push(request); return { result: request.phase === 'prepare' ? response() : { value: request.input.target } }; } });
  const value = manifest(); value.commands[0].ui = ui;
  await f.install(value); f.manager.saveConfig(value.id, { label: 'saved' });
  const command = f.manager.commands()[0]; const revision = f.manager.describeCommand(command.id).revision;
  let prepared = await f.manager.prepare(command.id, revision);
  assert.equal(calls[0].phase, 'prepare'); assert.deepEqual(calls[0].input, {});
  const request = { revision, prepareToken: prepared.token, input: { target: 'a' } };
  await assert.rejects(f.manager.execute(command, { ...request, input: { target: 'c' } }));
  await f.manager.execute(command, request);
  await assert.rejects(f.manager.execute(command, request), { code: 'EXTENSION_STALE_COMMAND' });
  prepared = await f.manager.prepare(command.id, revision);
  f.manager.saveConfig(value.id, { label: 'changed' });
  await assert.rejects(f.manager.execute(command, { ...request, prepareToken: prepared.token }), { code: 'EXTENSION_STALE_COMMAND' });
  prepared = await f.manager.prepare(command.id, revision);
  await f.manager.setEnabled(value.id, false); await f.manager.setEnabled(value.id, true);
  await assert.rejects(f.manager.execute(command, { ...request, prepareToken: prepared.token }), { code: 'EXTENSION_STALE_COMMAND' });
  prepared = await f.manager.prepare(command.id, revision);
  await f.install({ ...value, version: '1.1.0' });
  await assert.rejects(f.manager.execute(command, { ...request, prepareToken: prepared.token }), { code: 'EXTENSION_STALE_COMMAND' });
  assert.equal(calls.filter((r) => r.phase !== 'prepare').length, 1);
});

test('configuration changes during Prepare discard its response; empty required candidates cannot execute', async (t) => {
  let finish;
  const f = workspace(t, { executePython: () => new Promise((resolve) => { finish = resolve; }) });
  const value = manifest(); value.commands[0].ui = ui;
  await f.install(value); f.manager.saveConfig(value.id, { label: 'one' });
  const command = f.manager.commands()[0], revision = f.manager.describeCommand(command.id).revision;
  const pending = f.manager.prepare(command.id, revision);
  await new Promise(setImmediate); f.manager.saveConfig(value.id, { label: 'two' });
  finish({ result: response() }); await assert.rejects(pending, { code: 'EXTENSION_STALE_COMMAND' });
  f.manager.executePython = async () => ({ result: response([]) });
  const prepared = await f.manager.prepare(command.id, revision);
  await assert.rejects(f.manager.execute(command, { revision, prepareToken: prepared.token, input: {} }), { code: 'EXTENSION_PREPARE_EMPTY' });
});

test('a second Host changing saved state invalidates prepared input even before this Host reloads', async (t) => {
  const fs = require('node:fs');
  const f = workspace(t, { executePython: async () => ({ result: response() }) });
  const value = manifest(); value.commands[0].ui = ui;
  await f.install(value); f.manager.saveConfig(value.id, { label: 'one' });
  const command = f.manager.commands()[0], revision = f.manager.describeCommand(command.id).revision;
  const prepared = await f.manager.prepare(command.id, revision);
  const disk = JSON.parse(fs.readFileSync(f.manager.statePath));
  disk[value.id].enabled = false;
  fs.writeFileSync(f.manager.statePath, JSON.stringify(disk));
  await assert.rejects(f.manager.execute(command, { revision, prepareToken: prepared.token, input: { target: 'a' } }), { code: 'EXTENSION_STALE_COMMAND' });
});
