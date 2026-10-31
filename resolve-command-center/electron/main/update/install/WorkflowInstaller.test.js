const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createWorkflowInstaller, observeLauncher } = require('./WorkflowInstaller');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
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

test('handoff never asks for host exit on launch errors, silence, forged pipe data or timeout', async () => {
  for (const failure of ['error', 'exit', 'silent', 'wrong-id', 'wrong-process', 'oversized']) {
    const child = new EventEmitter(); child.pid = 42; child.stdout = new PassThrough(); child.unref = () => {};
    const states = []; let time = 0;
    const outcome = await observeLauncher(child, { id: 'a'.repeat(32), onState: (value) => states.push(value),
      installing: () => false, inspect: async () => { throw new Error('recovery-required'); },
      now: () => time, startupMs: 300, timeoutMs: 600, pause: async (ms) => {
        time += ms;
        if (failure === 'error') child.emit('error', new Error('spawn failed'));
        if (failure === 'exit') child.emit('exit', 1);
        if (failure === 'wrong-id' || failure === 'wrong-process') child.stdout.write(JSON.stringify({
          id: failure === 'wrong-id' ? 'b'.repeat(32) : 'a'.repeat(32), event: 'ready', pid: failure === 'wrong-process' ? 43 : 42 }) + '\n');
        if (failure === 'oversized') child.stdout.write('x'.repeat(4097));
      } });
    assert.deepEqual(outcome, { status: 'failed', reason: 'recovery-required' }, failure);
    assert.deepEqual(states, [], failure);
  }
});

test('live pipe readiness precedes exit prompt and terminal result still requires launcher exit and inspection', async () => {
  const child = new EventEmitter(); child.pid = 42; child.stdout = new PassThrough(); child.unref = () => {};
  const states = []; let time = 0; let inspected = false;
  const outcome = await observeLauncher(child, { id: 'a'.repeat(32), onState: (value) => states.push(value.status),
    installing: () => time >= 300, inspect: async () => { inspected = true; return { status: 'installed', reason: null }; },
    now: () => time, pause: async (ms) => {
      time += ms;
      if (time === 150) child.stdout.write(JSON.stringify({ id: 'a'.repeat(32), event: 'ready', pid: 42 }) + '\n');
      assert.equal(inspected, false);
      if (time === 450) child.emit('exit', 0);
    } });
  assert.deepEqual(states, ['waiting-for-exit', 'installing']);
  assert.deepEqual(outcome, { status: 'installed', reason: null });
  assert.equal(inspected, true);
});
