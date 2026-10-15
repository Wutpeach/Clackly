const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { registerUpdateIpc } = require('./registerIpc');
const { registerUpdateLifecycle } = require('./lifecycle');
test('update intents require the live Settings main frame and reject every argument', async () => {
  const handlers = new Map(); const sent = []; const calls = [];
  const mainFrame = {}; const contents = { mainFrame, isDestroyed: () => false, send: (...args) => sent.push(args) };
  let window = { isDestroyed: () => false, webContents: contents }; let listener;
  const snapshot = { schemaVersion: 1, status: 'idle' };
  const service = { ready: Promise.resolve(), getState: () => snapshot,
    checkForUpdates: () => { calls.push('check'); return snapshot; },
    downloadUpdate: () => { calls.push('download'); return snapshot; },
    cancelUpdate: () => { calls.push('cancel'); return snapshot; },
    discardUpdate: () => { calls.push('discard'); return snapshot; },
    prepareUpdateInstall: () => { calls.push('prepare-install'); return snapshot; },
    confirmUpdateInstall: () => { calls.push('confirm-install'); return snapshot; },
    cancelUpdateInstall: () => { calls.push('cancel-install'); return snapshot; },
    subscribe: (fn) => { listener = fn; return () => {}; } };
  registerUpdateIpc({ ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, updateService: service, getSettingsWindow: () => window });
  const trusted = { sender: contents, senderFrame: mainFrame };
  for (const [channel, handler] of handlers) {
    for (const event of [{ sender: {} }, { sender: contents }, { sender: contents, senderFrame: {} }]) assert.throws(() => handler(event));
    for (const arg of [null, undefined, {}, 'https://evil.test', '../file']) assert.throws(() => handler(trusted, arg));
    assert.equal(await handler(trusted), snapshot, channel);
  }
  assert.deepEqual(calls, ['check', 'download', 'cancel', 'discard', 'prepare-install', 'confirm-install', 'cancel-install']);
  listener(snapshot); assert.deepEqual(sent, [['updates:state-changed', snapshot]]);
  window = null; listener(snapshot); assert.equal(sent.length, 1);
  assert.throws(() => handlers.get('updates:download')(trusted));
});
test('real preload forwards only no-argument intents and unsubscribes state listener', () => {
  const source = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
  let api; const invokes = []; const emitter = new EventEmitter();
  emitter.invoke = (...args) => { invokes.push(args); return Promise.resolve(); };
  const contextBridge = { exposeInMainWorld: (_name, exposed) => { api = exposed; } };
  vm.runInNewContext(source, { require: (name) => name === 'electron' ? { contextBridge, ipcRenderer: emitter }
    : name === 'node:path' ? path : { isEnabled: () => false }, __dirname,
    window: { location: { search: '?view=settings' } }, URLSearchParams, Set });
  for (const method of ['getUpdateState', 'checkForUpdates', 'downloadUpdate', 'cancelUpdate', 'discardUpdate',
    'prepareUpdateInstall', 'confirmUpdateInstall', 'cancelUpdateInstall']) api[method]({ url: 'evil', path: 'evil' });
  assert.deepEqual(invokes.map((args) => Array.from(args)), [['updates:get-state'], ['updates:check'], ['updates:download'], ['updates:cancel'],
    ['updates:discard'], ['updates:prepare-install'], ['updates:confirm-install'], ['updates:cancel-install']]);
  let received; const off = api.onUpdateStateChanged((state) => { received = state; });
  emitter.emit('updates:state-changed', {}, { status: 'available' }); assert.equal(received.status, 'available');
  off(); assert.equal(emitter.listenerCount('updates:state-changed'), 0);
});
test('normal host quit waits for download cleanup then retries quit once', async () => {
  const app = new EventEmitter(); let resolve; let count = 0; let prevented = 0;
  app.quit = () => { count++; app.emit('before-quit', { preventDefault: () => { prevented++; } }); };
  registerUpdateLifecycle({ app, updateService: { dispose: () => new Promise((done) => { resolve = done; }) } });
  app.emit('before-quit', { preventDefault: () => { prevented++; } });
  assert.equal(prevented, 1); assert.equal(count, 0);
  app.emit('before-quit', { preventDefault: () => { prevented++; } });
  assert.equal(prevented, 2); assert.equal(count, 0); resolve();
  await new Promise((done) => setImmediate(done)); assert.equal(count, 1); assert.equal(prevented, 2);
});
test('both production hosts create updater after single-instance startup and target only Settings', () => {
  for (const name of ['../main.js', '../../../workflow-plugin/main.js']) {
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.match(source, /function registerIpcHandlers\(\) \{\s*updateService = createHostUpdateService/);
    assert.match(source, /registerUpdateIpc\(\{ ipcMain, updateService, getSettingsWindow: \(\) => settingsWindow \}\)/);
    assert.match(source, /registerUpdateLifecycle\(\{ app, updateService \}\)/);
    assert.match(source, /updateService\.start\(\)/);
    assert.match(source, /host: \{ kind: '(standalone|workflow)', execPath: process\.execPath \}/);
  }
});
