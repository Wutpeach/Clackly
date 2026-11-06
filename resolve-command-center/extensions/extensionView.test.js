const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { parseView, parseActionResult } = require('./extensionView');
const { validateManifest } = require('./package');
const { workspace, manifest } = require('./fixtures');
const { createExtensionViewHost } = require('./ExtensionViewHost');
const view = () => ({ $clackly: 'view', version: 1, id: 'markers', type: 'list', title: 'Markers', actions: [
  { id: 'refresh', title: 'Refresh', type: 'refresh' }], items: ['a', 'b'].map((id) => ({ id, title: id, tag: id,
    detail: { title: id, text: '<script>plain</script>', actions: [{ id: 'copy', title: 'Copy', type: 'copy' }] }, actions: [
      { id: 'detail', title: 'Detail', type: 'detail' }, { id: 'check', title: 'Check', type: 'extension', confirm: { message: 'Check?' } }] })) });
const declaration = (id = 'test.views') => manifest({ schemaVersion: 2, id, configSchema: {}, commands: [
  { id: 'open', name: 'Open markers', entry: 'inspect.py', view: { version: 1 } }] });
const form = () => ({ $clackly: 'view', version: 1, id: 'edit', type: 'form', title: 'Edit',
  inputs: { name: { type: 'string', label: 'Name', required: true, default: 'Original' } }, submit: { id: 'save', title: 'Save' } });
async function edit(f) {
  const list = view(); list.actions.unshift({ id: 'edit', title: 'Edit', type: 'extension' });
  f.setData(list); await f.open(); f.setResponse({ $clackly: 'view-action', version: 1, effect: 'push', view: form() }); await f.act('edit', 'view');
}
const draft = (f, name) => f.invoke('draft', { version: f.get().version, values: { name } });
const save = (f, extra = {}) => f.invoke('submit', { version: f.get().version, ...extra });
class Window extends EventEmitter {
  constructor() { super(); this.dead = false; this.minimized = false; this.webContents = { mainFrame: {}, send() {} }; }
  isDestroyed() { return this.dead; } isMinimized() { return this.minimized; }
  restore() { this.minimized = false; } show() {} focus() {} close() {
    let prevented = false; this.emit('close', { preventDefault() { prevented = true; } }); if (!prevented) this.destroy();
  }
  destroy() { this.dead = true; this.emit('closed'); }
}
const tick = () => new Promise(setImmediate);
async function fixture(t) {
  let data = view(), response = { $clackly: 'view-action', version: 1, effect: 'keep', message: 'Checked' }, gate = null;
  const requests = [];
  const f = workspace(t, { executePython: async (request) => { requests.push(request); return { result: gate ? await gate : request.phase === 'view_action' ? response : data }; } });
  await f.install(declaration());
  const windows = [], handlers = new Map(), events = new Map(), copied = [];
  const host = createExtensionViewHost({ extensions: f.manager, createWindow: () => { const w = new Window(); windows.push(w); return w; },
    hidePalette() {}, clipboard: { writeText: (text) => copied.push(text) } });
  host.registerIpc({ handle: (key, fn) => handlers.set(key, fn), on: (key, fn) => events.set(key, fn) });
  t.after(() => host.dispose());
  const event = (w = windows.at(-1)) => ({ sender: w.webContents, senderFrame: w.webContents.mainFrame });
  const invoke = (name, data, w) => handlers.get('extension-view:' + name)(event(w), data);
  const get = (w) => invoke('get', undefined, w);
  const act = (id, scope = 'item', extra = {}, w) => { const s = get(w); return invoke('action', { id, scope, itemId: scope === 'item' ? s.selectedId : null, version: s.version, ...extra }, w); };
  const open = async (id = 'extension:test.views/open') => { await host.start(id); await tick(); };
  return { ...f, host, windows, handlers, event, invoke, get, act, open, copied, requests, setData: (v) => { data = v; }, setResponse: (v) => { response = v; }, setGate: (v) => { gate = v; } };
}
test('Views require a new manifest and remain distinct from Command UI', () => {
  assert.equal(validateManifest(declaration()).commands[0].view.version, 1);
  for (const change of [v => v.schemaVersion = 1, v => v.commands[0].view.version = 2, v => v.commands[0].view.html = 'code']) {
    const bad = declaration(); change(bad);
    assert.throws(() => validateManifest(bad));
  }
  const bad = declaration(); bad.commands[0].ui = { version: 1, inputs: {} }; assert.throws(() => validateManifest(bad));
  assert.equal(validateManifest(manifest()).schemaVersion, 1);
});
test('bounded List/Detail/Action contracts reject duplicate identities, code, arbitrary fields and excessive responses', () => {
  assert.equal(parseView(view()).items[0].detail.text, '<script>plain</script>');
  for (const mutate of [v => v.items.push(v.items[0]), v => v.items[0].html = 'code', v => v.items[0].actions[0].type = 'eval',
    v => v.items = Array(501).fill(v.items[0]), v => v.items[0].id = 'x'.repeat(513), v => v.items[0].detail.text = 'x'.repeat(32769),
    v => v.items[0].actions[0].confirm = { message: 'Not an extension action' }, v => v.actions.push({id:'refresh',title:'R',type:'refresh'})]) {
    const data = view(); mutate(data); assert.throws(() => parseView(data), { code: 'EXTENSION_VIEW_INVALID' });
  }
  assert.throws(() => parseActionResult({ $clackly: 'view-action', version: 1, effect: 'open-window' }));
  assert.throws(() => parseActionResult({ $clackly: 'view-action', version: 1, effect: 'keep', view: view() }));
});
test('same extension restores a singleton, different extensions coexist; close/reopen starts a new session', async (t) => {
  const f = await fixture(t); await f.open(); const a = f.windows[0], first = f.get(a).sessionId;
  a.minimized = true; await f.open(); assert.equal(f.windows.length, 1); assert.equal(a.minimized, false);
  assert.equal(f.get(a).sessionId, first);
  await f.install(declaration('test.other')); await f.open('extension:test.other/open');
  assert.equal(f.windows.length, 2); assert.equal(a.isDestroyed(), false);
  a.close(); await f.open(); assert.notEqual(f.get().sessionId, first);
});
test('client list filtering, stable selection, detail navigation and copying do not invoke business execution', async (t) => {
  const f = await fixture(t); await f.open(); const first = f.get();
  f.setGate(new Promise(() => {}));
  f.invoke('select', { query: 'b', filter: '', selectedId: 'b', version: first.version });
  await f.act('detail'); assert.equal(f.get().depth, 2); assert.equal(f.get().view.title, 'b');
  await f.act('copy', 'view'); assert.ok(f.copied[0].includes('<script>plain</script>'));
  f.invoke('back'); assert.equal(f.get().query, 'b'); assert.equal(f.get().selectedId, 'b');
  await assert.rejects(f.act('check', 'item', { itemId: 'a' }), /已变化/);
  assert.throws(() => f.handlers.get('extension-view:get')({ sender: {}, senderFrame: {} }), /rejected/);
  assert.throws(() => f.handlers.get('extension-view:get')({ sender: f.windows[0].webContents, senderFrame: {} }), /rejected/);
});
test('confirmation cannot be bypassed, duplicates and stale versions are blocked; action feedback is constrained', async (t) => {
  const f = await fixture(t); await f.open();
  await assert.rejects(f.act('check', 'item', { confirmed: true }), /确认/);
  await f.act('check'); assert.equal(f.get().confirmation.message, 'Check?');
  f.invoke('cancel-confirmation'); assert.equal(f.get().confirmation, null);
  await f.act('check'); let finish; f.setGate(new Promise((resolve) => { finish = resolve; }));
  const running = f.act('check', 'item', { confirmed: true }); await tick();
  await assert.rejects(f.act('check'), /未就绪/);
  finish({ $clackly: 'view-action', version: 1, effect: 'keep', message: 'Checked' }); await running;
  assert.equal(f.get().message, 'Checked'); f.setGate(null);
  await assert.rejects(f.act('detail', 'item', { version: 0 }), /过期/);
});
test('refresh clears removed selection, preserves filter/query and never substitutes another object', async (t) => {
  const f = await fixture(t); await f.open();
  const next = view(); next.items.shift(); f.setData(next);
  await f.invoke('refresh'); assert.equal(f.get().selectedId, null); assert.equal(f.get().message, 'selectionCleared');
  await assert.rejects(f.act('detail'), /已变化/);
  assert.equal(f.get().view.items[0].id, 'b');
});
test('invalid/failed load offers retry, close discards a late response without reviving a session', async (t) => {
  const f = await fixture(t); f.setData({ wrong: true }); await f.open(); assert.equal(f.get().phase, 'error');
  f.setData(view()); await f.invoke('refresh'); assert.equal(f.get().phase, 'ready');
  let finish; f.setGate(new Promise(resolve => { finish = resolve; }));
  const running = f.invoke('refresh'); const closed = f.windows[0]; closed.close();
  finish(view()); await running;
  assert.throws(() => f.get(closed), /rejected/);
  f.setGate(null); await f.open(); assert.equal(f.get().phase, 'ready');
});
test('config, disable, uninstall and Replace close active views', async (t) => {
  const f = await fixture(t);
  for (const operation of ['config', 'disable', 'replace', 'uninstall']) {
    if (!f.manager.state['test.views']?.revision) await f.install(declaration());
    if (!f.manager.get('test.views').enabled) await f.manager.setEnabled('test.views', true);
    await f.open(); const window = f.windows.at(-1);
    if (operation === 'config') f.manager.saveConfig('test.views', {});
    if (operation === 'disable') await f.manager.setEnabled('test.views', false);
    if (operation === 'replace') await f.install(declaration());
    if (operation === 'uninstall') await f.manager.uninstall('test.views', true);
    assert.equal(window.isDestroyed(), true, operation);
  }
});

test('another Host changing disk configuration rejects existing view actions', async (t) => {
  const f = await fixture(t); await f.open();
  const disk = JSON.parse(fs.readFileSync(f.manager.statePath, 'utf8'));
  disk['test.views'].config = { changedByAnotherHost: true };
  fs.writeFileSync(f.manager.statePath, JSON.stringify(disk));
  await assert.rejects(f.act('detail'), /配置已变化/);
  assert.equal(f.get().depth, 1);
});

test('Extension Actions may push/back/refresh/close; a failed refresh remains an error and can recover', async (t) => {
  const f = await fixture(t); const data = view();
  data.actions.unshift({ id: 'run', title: 'Run', type: 'extension' }); f.setData(data); await f.open();
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'push', view: data });
  await f.act('run', 'view'); assert.equal(f.get().depth, 2);
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'back' });
  await f.act('run', 'view'); assert.equal(f.get().depth, 1);
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'refresh' });
  f.setData({ wrong: true }); await f.act('run', 'view');
  assert.equal(f.get().phase, 'error');
  f.setData(data); await f.invoke('refresh'); assert.equal(f.get().phase, 'ready');
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'close' });
  const window = f.windows[0]; await f.act('run', 'view'); assert.equal(window.isDestroyed(), true);
});

test('Form/batch schemas reuse Command fields and require bounded results and dangerous confirmations', () => {
  assert.equal(parseView(form()).inputs.name.default, 'Original');
  for (const mutate of [v => v.submit.dangerous = true, v => v.inputs.name.type = 'html', v => v.refreshOnFocus = true,
    v => v.items = [], v => v.batchActions = []]) { const v = form(); mutate(v); assert.throws(() => parseView(v)); }
  const v = view(); v.batchActions = [{ id: 'batch', title: 'Batch', type: 'extension', dangerous: true, confirm: { message: 'Write?' } }];
  assert.equal(parseView(v).batchActions.length, 1);
  for (const summary of [{ succeeded: 1, failed: 1, errors: [] }, { succeeded: 101, failed: 0, errors: [] },
    { succeeded: 0, failed: 2, errors: [{ id: 'a', message: 'Failed' }, { id: 'a', message: 'Again' }] }]) {
    assert.throws(() => parseActionResult({ $clackly: 'view-action', version: 1, effect: 'refresh', summary }));
  }
});

test('clean navigation is quiet; dirty back, close, refresh and switching require discard without writing', async (t) => {
  const f = await fixture(t); await edit(f); assert.deepEqual(f.get().values, { name: 'Original' });
  f.invoke('back'); assert.equal(f.get().depth, 1); assert.equal(f.get().confirmation, null);
  await f.act('edit', 'view'); draft(f, 'Draft'); assert.equal(f.get().dirty, true);
  f.invoke('back'); assert.equal(f.get().confirmation.kind, 'discard');
  f.invoke('cancel-confirmation'); assert.equal(f.get().values.name, 'Draft');
  f.windows[0].close(); assert.equal(f.windows[0].isDestroyed(), false); assert.equal(f.get().confirmation.kind, 'discard');
  f.invoke('cancel-confirmation');
  await f.invoke('refresh'); assert.equal(f.get().values.name, 'Draft'); f.invoke('cancel-confirmation');
  const before = f.requests.length; f.invoke('back'); await f.invoke('discard'); assert.equal(f.get().depth, 1); assert.equal(f.requests.length, before);
  const switching = form(); switching.actions = [{ id: 'other', title: 'Other', type: 'extension' }];
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'push', view: switching }); await f.act('edit', 'view'); draft(f, 'Unsaved');
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'keep' }); await f.act('other', 'view');
  assert.equal(f.get().confirmation.kind, 'discard'); await f.invoke('discard'); assert.equal(f.get().dirty, false);
  assert.equal(f.get().values.name, 'Original');
  draft(f, 'Close'); f.windows[0].close(); await f.invoke('discard'); assert.equal(f.windows[0].isDestroyed(), true);
});

test('explicit validated save keeps failed input, blocks duplicate writes and refreshes its source once complete', async (t) => {
  const f = await fixture(t); await edit(f); draft(f, ''); await assert.rejects(save(f), /Name|必填/);
  draft(f, 'New name'); f.setResponse({ invalid: true }); await save(f);
  assert.equal(f.get().phase, 'ready'); assert.equal(f.get().values.name, 'New name'); assert.ok(f.get().error);
  const submission = f.requests.at(-1); assert.deepEqual(submission.input, { name: 'New name' }); assert.equal(submission.view.scope, 'form');
  let finish; f.setGate(new Promise(resolve => { finish = resolve; })); const running = save(f); await tick();
  await assert.rejects(save(f), /正在保存/); f.windows[0].close(); assert.equal(f.windows[0].isDestroyed(), false);
  f.setGate(null); finish({ $clackly: 'view-action', version: 1, effect: 'back', message: 'Saved' }); await running;
  assert.equal(f.get().depth, 1); assert.equal(f.get().message, 'Saved'); assert.equal(f.requests.at(-1).phase, 'view');
  await assert.rejects(f.invoke('submit', { version: 0 }), /过期/);
});

test('save confirmation cannot be bypassed; completed writes are not offered again after source refresh fails', async (t) => {
  const f = await fixture(t); const confirmed = form(); confirmed.submit.confirm = { message: 'Save?' };
  f.setData(confirmed); await f.open(); draft(f, 'Changed'); await assert.rejects(save(f, { confirmed: true }), /确认/);
  await save(f); assert.equal(f.get().confirmation.kind, 'submit');
  assert.throws(() => draft(f, 'Other'), /过期/);
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'close' }); await save(f, { confirmed: true }); assert.equal(f.windows[0].isDestroyed(), true);
  const g = await fixture(t); await edit(g); draft(g, 'Changed'); g.setData({ wrong: true });
  g.setResponse({ $clackly: 'view-action', version: 1, effect: 'back', summary: { succeeded: 1, failed: 0, errors: [] } });
  await save(g); assert.equal(g.get().depth, 1); assert.equal(g.get().phase, 'error'); assert.equal(g.get().summary.succeeded, 1);
  await assert.rejects(save(g), /过期/);
});

test('batch selection is bounded, confirmed and exact; partial results survive refresh and removed IDs clear', async (t) => {
  const f = await fixture(t), data = view(); data.batchActions = [{ id: 'batch', title: 'Batch', type: 'extension', dangerous: true, confirm: { message: 'Batch?' } }];
  f.setData(data); await f.open();
  const select = (extra) => f.invoke('select', { query: '', filter: '', selectedId: 'a', version: f.get().version, multiSelect: true, selectedIds: ['a', 'b'], ...extra });
  select(); assert.throws(() => select({ selectedIds: ['a', 'a'] }), /有效对象/);
  await assert.rejects(f.act('batch', 'batch', { itemIds: ['b'] }), /已变化/);
  await assert.rejects(f.act('check'), /已变化/);
  const batch = (extra = {}) => f.act('batch', 'batch', { itemIds: f.get().selectedIds, ...extra });
  await batch(); assert.equal(f.get().confirmation.kind, 'action');
  const summary = { succeeded: 1, failed: 1, errors: [{ id: 'b', message: 'b: no longer writable' }] };
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'refresh', summary });
  f.setData({ ...data, items: data.items.slice(1) }); await batch({ confirmed: true });
  assert.deepEqual(f.get().summary, summary); assert.deepEqual(f.get().selectedIds, ['b']); assert.equal(f.get().message, 'selectionCleared');
  const request = f.requests.findLast(r => r.phase === 'view_action'); assert.deepEqual(request.view.itemIds, ['a', 'b']);
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'refresh', summary });
  await batch(); await batch({ confirmed: true }); assert.equal(f.get().phase, 'error'); assert.match(f.get().error.message, /不一致/);
});

test('refocus refresh is opt-in and never overwrites a Form draft', async (t) => {
  const f = await fixture(t); const data = view(); data.refreshOnFocus = true; data.actions.unshift({ id: 'edit', title: 'Edit', type: 'extension' });
  f.setData(data); await f.open(); const w = f.windows[0];
  f.setData({ ...data, items: data.items.slice(1) }); w.emit('blur'); w.emit('focus'); await tick();
  assert.equal(f.get().view.items.length, 1); assert.equal(f.get().selectedId, null);
  f.setResponse({ $clackly: 'view-action', version: 1, effect: 'push', view: form() }); await f.act('edit', 'view'); draft(f, 'Keep me');
  const before = f.requests.length; w.emit('blur'); w.emit('focus'); await tick();
  assert.equal(f.requests.length, before); assert.equal(f.get().values.name, 'Keep me');
});
