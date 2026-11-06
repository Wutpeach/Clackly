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
class Window extends EventEmitter {
  constructor() { super(); this.dead = false; this.minimized = false; this.webContents = { mainFrame: {}, send() {} }; }
  isDestroyed() { return this.dead; } isMinimized() { return this.minimized; }
  restore() { this.minimized = false; } show() {} focus() {} close() { this.emit('close'); this.destroy(); }
  destroy() { this.dead = true; this.emit('closed'); }
}
const tick = () => new Promise(setImmediate);
async function fixture(t) {
  let data = view(), response = { $clackly: 'view-action', version: 1, effect: 'keep', message: 'Checked' }, gate = null;
  const f = workspace(t, { executePython: async ({ phase }) => ({ result: gate ? await gate : phase === 'view_action' ? response : data }) });
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
  return { ...f, host, windows, handlers, event, invoke, get, act, open, copied, setData: (v) => { data = v; }, setResponse: (v) => { response = v; }, setGate: (v) => { gate = v; } };
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
