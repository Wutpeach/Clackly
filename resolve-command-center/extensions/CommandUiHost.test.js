const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createCommandUiHost } = require('./CommandUiHost');
class Window extends EventEmitter {
  constructor() { super(); this.webContents = { mainFrame: {}, send() {} }; this.destroyed = false; }
  isDestroyed() { return this.destroyed; }
  show() {} focus() {} showInactive() {}
  close() { let blocked = false; this.emit('close', { preventDefault: () => { blocked = true; } }); if (!blocked) this.destroy(); }
  destroy() { this.destroyed = true; this.emit('closed'); }
}
function fixture(t, execute) {
  const windows = []; const palette = new Window(); const handlers = new Map(); const listeners = new Map();
  const command = { id: 'extension:test/run', name: 'Run', revision: 'rev1', ui: { version: 1, inputs: { count: { type: 'number', label: 'Count', min: 1, max: 3, required: true } }, confirm: { message: 'Confirm?' } } };
  const host = createCommandUiHost({ extensions: { describeCommand: () => command }, execute,
    createWindow: () => { const window = new Window(); windows.push(window); return window; }, hidePalette() {}, showPalette() {},
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) } });
  const start = host.registerIpc({ handle: (key, action) => handlers.set(key, action), on: (key, action) => listeners.set(key, action) }, () => palette);
  t.after(() => host.dispose());
  const event = (window) => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  return { windows, palette, handlers, listeners, host, start, event };
}
test('foreign frames, invalid input and unconfirmed actions cannot execute; closing input has no side effects', async (t) => {
  let executions = 0; const f = fixture(t, async () => { executions++; });
  await assert.rejects(f.start(f.event(new Window()), 'extension:test/run'));
  await f.start(f.event(f.palette), 'extension:test/run');
  const window = f.windows[0]; const submit = f.handlers.get('command-ui:submit');
  await assert.rejects(submit(f.event(f.palette), { count: 2 }, true));
  await assert.rejects(submit({ ...f.event(window), senderFrame: {} }, { count: 2 }, true));
  await assert.rejects(submit(f.event(window), { count: 7 }, true));
  await assert.rejects(submit(f.event(window), { count: 2 }, false));
  f.listeners.get('command-ui:close')(f.event(window));
  assert.equal(executions, 0); assert.equal(window.isDestroyed(), true);
});
test('host retains one running session, ignores close and rejects duplicate submit until a real final result', async (t) => {
  let resolve; let executions = 0;
  const f = fixture(t, async (_id, request) => { assert.deepEqual(request, { input: { count: 2 }, confirmed: true, revision: 'rev1' }); executions++; return new Promise((done) => { resolve = done; }); });
  await f.host.start('extension:test/run'); const window = f.windows[0];
  const running = f.handlers.get('command-ui:submit')(f.event(window), { count: 2 }, true);
  assert.equal(f.handlers.get('command-ui:get')(f.event(window)).phase, 'running');
  window.close(); assert.equal(window.isDestroyed(), false);
  f.listeners.get('command-ui:close')(f.event(window)); assert.equal(window.isDestroyed(), false);
  await f.host.start('extension:test/run'); assert.equal(f.windows.length, 1);
  await assert.rejects(f.handlers.get('command-ui:submit')(f.event(window), { count: 2 }, true));
  resolve({ result: { $clackly: 'result', version: 1, status: 'success', message: 'Done', text: 'Readable detail' } }); await running;
  assert.equal(executions, 1); assert.equal(f.handlers.get('command-ui:get')(f.event(window)).phase, 'result');
  window.close(); assert.equal(window.isDestroyed(), true);
});

test('multiline and long success messages remain in a persistent result instead of a brief notification', async (t) => {
  for (const message of ['Line one\n'.repeat(20), '结果'.repeat(40)]) {
    const f = fixture(t, async () => ({ result: { $clackly: 'result', version: 1, status: 'success', message } }));
    await f.host.start('extension:test/run'); const window = f.windows[0];
    await f.handlers.get('command-ui:submit')(f.event(window), { count: 2 }, true);
    const state = f.handlers.get('command-ui:get')(f.event(window));
    assert.equal(state.phase, 'result'); assert.equal(state.result.message, message);
    assert.equal(window.isDestroyed(), false); assert.equal(f.windows.length, 1);
    window.close();
  }
});

test('host shutdown destroys its running window and a late Python return cannot reopen it', async (t) => {
  let resolve;
  const f = fixture(t, async () => new Promise((done) => { resolve = done; }));
  await f.host.start('extension:test/run'); const window = f.windows[0];
  const running = f.handlers.get('command-ui:submit')(f.event(window), { count: 2 }, true);
  f.host.dispose(); assert.equal(window.isDestroyed(), true);
  resolve({ result: { $clackly: 'result', version: 1, status: 'success', message: 'Done', text: 'Late result' } });
  await running; assert.equal(f.windows.length, 1);
});
