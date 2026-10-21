const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { verifyZip, entryPath } = require('./zip');
const { payload, zipBuffer, workspace, manifest } = require('./fixtures');
test('valid flattened Workflow payload accepted; malformed identities and required entries rejected', async (t) => {
  const { root } = await workspace(t); const file = path.join(root, 'fixture.zip');
  await fs.writeFile(file, zipBuffer());
  const result = await verifyZip(file, '0.2.0');
  assert.equal(result.entries, payload().length);
  assert.equal(result.manifest.schemaVersion, 2);
  assert.equal(result.manifest.native.provisioning, 'local-resolve');
  const missing = payload().filter(([name]) => !name.endsWith('main.js'));
  const wrong = payload().map(([name, data]) => [name, name.endsWith('manifest.xml') ? manifest('0.3.0') : data]);
  const foreignMain = payload().map(([name, data]) => [name, name.endsWith('main.js') ? 'const PLUGIN_ID = "foreign";' : data]);
  for (const entries of [missing, wrong, payload('0.3.0'), foreignMain]) {
    await fs.writeFile(file, zipBuffer(entries));
    await assert.rejects(verifyZip(file, '0.2.0'));
  }
});

test('download and restored-candidate gate rejects legacy manifests, native bytes and inventory tampering', async (t) => {
  const { root } = await workspace(t); const file = path.join(root, 'candidate.zip');
  const changeManifest = (change) => payload().map(([name, bytes]) => {
    if (name !== 'plugin/clackly-release.json') return [name, bytes];
    const value = JSON.parse(bytes); change(value); return [name, JSON.stringify(value)];
  });
  for (const entries of [
    changeManifest((value) => { value.schemaVersion = 1; }),
    changeManifest((value) => { value.build.publishable = false; }),
    changeManifest((value) => { value.build.publishable = false; value.source.dirty = true; }),
    changeManifest((value) => { value.source.dirty = true; }),
    changeManifest((value) => { value.native.source = 'caller-selected'; }),
    changeManifest((value) => { value.native.sha256 = 'a'.repeat(64); }),
    changeManifest((value) => { value.files.pop(); }),
    [...payload(), ['plugin/workflow-plugin/WorkflowIntegration.node', 'old native']],
    [...payload(), ['plugin/other/workflowintegration.NODE', 'hidden native']],
    payload().map(([name, bytes]) => [name, name.endsWith('python.exe') ? 'changed runtime' : bytes])
  ]) {
    await fs.writeFile(file, zipBuffer(entries));
    await assert.rejects(verifyZip(file, '0.2.0'), { code: 'invalid-zip' });
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
