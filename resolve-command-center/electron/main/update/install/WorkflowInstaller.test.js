const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createWorkflowInstaller } = require('./WorkflowInstaller');
const { readPointer, projectOutcome } = require('./outcome');
const evidence = path.resolve(__dirname, '../../../..', 'build/test-evidence/installer-node');
function fixture() {
  fs.mkdirSync(evidence, { recursive: true });
  const root = fs.mkdtempSync(path.join(evidence, 'case-'));
  const appRoot = path.join(root, 'installed'); const cacheRoot = path.join(root, 'cache');
  fs.mkdirSync(appRoot); fs.mkdirSync(cacheRoot);
  const bytes = Buffer.from('INERT RETAINED CANDIDATE');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const name = crypto.randomBytes(16).toString('hex') + '.zip';
  const file = path.join(cacheRoot, name); fs.writeFileSync(file, bytes);
  const candidate = { file, name, version: '0.2.0', size: bytes.length, digest,
    release: { version: '0.2.0', size: bytes.length, digest, releaseId: 12, assetId: 25,
      url: 'https://github.com/Wutpeach/Clackly/releases/download/v0.2.0/Clackly-Workflow-0.2.0-win-x64.zip' } };
  return { root, appRoot, cacheRoot, candidate,
    installer: createWorkflowInstaller({ appRoot, cacheRoot, host: { kind: 'workflow', execPath: process.execPath } }) };
}

test('production qualification requires fixed installed application; no launcher or installed writes', async () => {
  const f = fixture();
  assert.deepEqual(await f.installer.qualify(f.candidate), { ready: false,
    reason: process.platform === 'win32' ? 'target-unverified' : 'unsupported-host' });
  assert.deepEqual(await f.installer.start(f.candidate), { status: 'failed',
    reason: process.platform === 'win32' ? 'target-unverified' : 'unsupported-host' });
  assert.deepEqual(fs.readdirSync(f.appRoot), []);
  assert.deepEqual(fs.readdirSync(f.cacheRoot), [f.candidate.name]);
});

test('candidate path substitution and changed retained bytes fail closed', { skip: process.platform !== 'win32' }, async () => {
  const f = fixture();
  assert.equal((await f.installer.qualify({ ...f.candidate, file: path.join(f.appRoot, f.candidate.name) })).reason, 'invalid-package');
  fs.appendFileSync(f.candidate.file, 'changed');
  assert.equal((await f.installer.qualify(f.candidate)).reason, 'invalid-package');
});

test('pre-launch abort is acknowledged with no installation artifact', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  assert.deepEqual(await f.installer.start(f.candidate, { signal: controller.signal }), { status: 'cancelled', reason: null });
  assert.deepEqual(await f.installer.cancel(), { status: 'cancelled', reason: null });
  assert.equal(await f.installer.readState(), null);
});

test('restart ignores absent pointer and rejects forged terminal result outside installed executor', async () => {
  const f = fixture(); assert.equal(await f.installer.readState(), null);
  const pointer = { schemaVersion: 1, id: 'a'.repeat(32), version: '0.2.0', digest: 'b'.repeat(64), size: 99,
    policyDigest: 'c'.repeat(64), requestRoot: f.appRoot, status: 'installed' };
  fs.writeFileSync(path.join(f.cacheRoot, 'installation.json'), JSON.stringify(pointer));
  fs.writeFileSync(path.join(f.appRoot, 'result.json'), JSON.stringify({ id: pointer.id, status: 'installed', reason: null }));
  assert.deepEqual(await f.installer.readState(), { status: 'failed', reason: 'recovery-required' });
  const parsed = readPointer(f.cacheRoot, () => {});
  assert.equal('requestRoot' in parsed, false); assert.equal('status' in parsed, false);
});

test('restart bounds malformed/oversized identity and public projection', async () => {
  const f = fixture(); const file = path.join(f.cacheRoot, 'installation.json');
  for (const text of ['{', 'x'.repeat(65537), JSON.stringify({ schemaVersion: 1, id: '../changed' })]) {
    fs.writeFileSync(file, text);
    assert.deepEqual(await f.installer.readState(), { status: 'failed', reason: 'recovery-required' });
  }
  assert.deepEqual(projectOutcome({ id: 'id', status: 'rolled-back', reason: null, path: 'private' }, 'id'), { status: 'rolled-back', reason: null });
  for (const value of [{ id: 'other', status: 'installed', reason: null }, { id: 'id', status: 'waiting-for-exit', reason: null },
    { id: 'id', status: 'failed', reason: 'C:/private/error' }]) assert.throws(() => projectOutcome(value, 'id'), /recovery-required/);
});

test('fixed independent executor and recovery CLI reject development code before writes', { skip: process.platform !== 'win32' }, () => {
  const scriptRoot = path.resolve(__dirname, '../../../../scripts/workflow-update');
  for (const name of ['executor.ps1', 'recover.ps1']) {
    const child = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(scriptRoot, name), '-RequestId', 'a'.repeat(32)],
      { windowsHide: true, encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, 1, child.stderr);
    const result = JSON.parse(child.stdout.trim());
    assert.equal(result.status, 'failed'); assert.equal(result.reason, 'target-unverified');
  }
  assert.equal(fs.existsSync(path.join(scriptRoot, 'result.json')), false);
});
