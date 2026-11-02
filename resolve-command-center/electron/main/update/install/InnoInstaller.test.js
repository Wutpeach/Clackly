const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createInnoInstaller } = require('./InnoInstaller');
const { exeBuffer, workspace } = require('../fixtures');
const { fileStorage } = require('../file-storage-fixture');

async function fixture(t, openPath) {
  const { cacheRoot } = await workspace(t);
  await fs.mkdir(cacheRoot);
  const name = 'a'.repeat(32) + '.exe';
  const file = path.join(cacheRoot, name); const bytes = exeBuffer();
  await fs.writeFile(file, bytes);
  return { file, bytes, candidate: { name, file, size: bytes.length,
    digest: crypto.createHash('sha256').update(bytes).digest('hex') },
    installer: createInnoInstaller({ storage: fileStorage(cacheRoot), platform: 'win32', openPath }) };
}

test('final cache verification rejects missing, modified and ZIP candidates before opening Windows', async (t) => {
  let opened = 0;
  const { installer, candidate, bytes, file } = await fixture(t, async () => { opened++; return ''; });
  assert.deepEqual(await installer.start({ ...candidate, name: candidate.name.replace('.exe', '.zip') }), { status: 'failed', reason: 'invalid-package' });
  const changed = Buffer.from(bytes); changed[200] ^= 1; await fs.writeFile(file, changed);
  assert.equal((await installer.start(candidate)).reason, 'invalid-package');
  await fs.unlink(file);
  assert.equal((await installer.start(candidate)).reason, 'invalid-package');
  assert.equal(opened, 0);
  await fs.writeFile(file, bytes);
  assert.deepEqual(await installer.start(candidate), { status: 'handed-off', reason: null });
  assert.equal(opened, 1);
});

test('Windows cancellation or open failure is bounded and never reports installation success', async (t) => {
  for (const openPath of [async () => 'User cancelled UAC; private OS text', async () => { throw Error('private path'); }]) {
    const { installer, candidate } = await fixture(t, openPath);
    assert.deepEqual(await installer.start(candidate), { status: 'failed', reason: 'launch-failed' });
  }
});
