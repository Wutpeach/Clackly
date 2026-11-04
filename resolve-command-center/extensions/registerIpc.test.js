const test = require('node:test');
const assert = require('node:assert/strict');
const { registerExtensionIpc } = require('./registerIpc');
const { workspace } = require('./fixtures');

test('only Settings main frame can import/manage packages; confirmation tokens cannot become execution paths', async (t) => {
  const { manager, pack } = workspace(t);
  const handlers = new Map();
  const contents = { mainFrame: {}, isDestroyed: () => false, send() {} };
  const window = { isDestroyed: () => false, webContents: contents };
  const event = { sender: contents, senderFrame: contents.mainFrame };
  registerExtensionIpc({ ipcMain: { handle: (name, action) => handlers.set(name, action) },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [pack()] }) },
    extensions: manager, getSettingsWindow: () => window, getWindows: () => [window] });
  for (const action of handlers.values()) {
    assert.throws(() => action({ sender: {}, senderFrame: {} }), /rejected/);
    assert.throws(() => action({ ...event, senderFrame: {} }), /rejected/);
  }
  assert.throws(() => handlers.get('extensions:preview')(event, 'C:/arbitrary.clackly'), /rejected/);
  const preview = await handlers.get('extensions:preview')(event);
  await assert.rejects(handlers.get('extensions:install')(event, preview.token, 'downgrade'), { code: 'EXTENSION_CONFIRMATION_REQUIRED' });
  await handlers.get('extensions:install')(event, preview.token, 'install');
  assert.equal(handlers.get('extensions:list')(event)[0].id, 'test.tools');
  assert.equal([...handlers.keys()].some((name) => /execute|path/.test(name)), false);
});
