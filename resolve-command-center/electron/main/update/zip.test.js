const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { verifyZip, entryPath } = require('./zip');
const { payload, zipBuffer, workspace, manifest } = require('./fixtures');
test('valid flattened Workflow payload accepted; malformed identities and required entries rejected', async (t) => {
  const { root } = await workspace(t); const file = path.join(root, 'fixture.zip');
  await fs.writeFile(file, zipBuffer());
  assert.equal((await verifyZip(file, '0.2.0')).entries, 6);
  const missing = payload().filter(([name]) => !name.endsWith('main.js'));
  const wrong = payload().map(([name, data]) => [name, name.endsWith('manifest.xml') ? manifest('0.3.0') : data]);
  const foreignMain = payload().map(([name, data]) => [name, name.endsWith('main.js') ? 'const PLUGIN_ID = "foreign";' : data]);
  for (const entries of [missing, wrong, payload('0.3.0'), foreignMain]) {
    await fs.writeFile(file, zipBuffer(entries));
    await assert.rejects(verifyZip(file, '0.2.0'));
  }
});
test('ZIP traversal, ADS, symlink/device, encryption, case collision and expansion attacks rejected', async (t) => {
  const { root } = await workspace(t); const file = path.join(root, 'attack.zip');
  for (const attack of [
    ['plugin/../outside', 'evil'], ['plugin/a:b', 'evil'], ['plugin/a\\b', 'evil'], ['plugin/NUL.txt', 'evil'],
    ['plugin/space. ', 'evil'], ['plugin/link', 'x', { attributes: 0xa1ff0000 }],
    ['plugin/device', 'x', { attributes: 0x21ff0000 }], ['plugin/encrypted', 'x', { flags: 1 }],
    ['plugin/PACKAGE.json', '{}'], ['plugin/bomb', 'x', { uncompressedSize: 2 ** 30 }],
    ['plugin/workflow-plugin', 'file directory collision']
  ]) {
    await fs.writeFile(file, zipBuffer([...payload(), attack]));
    await assert.rejects(verifyZip(file, '0.2.0'), undefined, attack[0]);
  }
  assert.throws(() => entryPath({ fileName: 'plugin/test', uncompressedSize: 2 ** 31, compressionMethod: 0, externalFileAttributes: 0 }));
  await fs.writeFile(file, zipBuffer([...payload(), ['plugin/A/one', 'x'], ['plugin/a/two', 'x']]));
  await assert.rejects(verifyZip(file, '0.2.0'));
});
