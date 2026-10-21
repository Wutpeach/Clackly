// Explicitly run after the parallel source suite, with --test-concurrency=1.
// These tests retain real PowerShell, filesystem guards and the fixed CLI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { zipBuffer, release, response, workspace } = require('./fixtures');

// Observe the real guard children without replacing their execution or result.
// Storage captures execFile at import; restore the shared module immediately.
const probes = [];
const actualExecFile = childProcess.execFile;
let UpdateStorage; let createHostUpdateService;
childProcess.execFile = (executable, args, options, callback) => {
  const started = Date.now();
  return actualExecFile(executable, args, options, (error, stdout, stderr) => {
    probes.push({ executable, elapsedMs: Date.now() - started, timeoutMs: options.timeout,
      error: error ? { code: error.code, message: error.message, killed: error.killed, signal: error.signal } : null,
      stdout, stderr });
    callback(error, stdout, stderr);
  });
};
try {
  ({ UpdateStorage } = require('./storage'));
  ({ createHostUpdateService } = require('./UpdateService'));
} finally { childProcess.execFile = actualExecFile; }

async function withStorageDiagnostics(t, action) {
  const start = probes.length;
  try { await action(); }
  catch (error) { t.diagnostic(JSON.stringify({ storageChildren: probes.slice(start) })); throw error; }
  t.diagnostic(`Completed ${probes.length - start} real Windows path probes`);
}

test('real storage persists cache and retained bytes while removing only owned temporary/orphan files', async (t) => {
  await withStorageDiagnostics(t, async () => {
    const { cacheRoot, appRoot } = await workspace(t);
    await fs.mkdir(cacheRoot);
    const part = 'a'.repeat(32) + '.part'; const temp = 'cache-' + 'b'.repeat(32) + '.tmp';
    const orphan = 'c'.repeat(32) + '.zip';
    for (const name of [part, temp, orphan, 'unrelated.txt']) await fs.writeFile(path.join(cacheRoot, name), name);
    const storage = new UpdateStorage(cacheRoot, appRoot);
    await storage.prepare();
    assert.deepEqual((await fs.readdir(cacheRoot)).sort(), [orphan, 'unrelated.txt'].sort());
    const cache = { schemaVersion: 1, releases: [], downloaded: null };
    await storage.saveCache(cache);
    assert.deepEqual(await storage.readCache(), cache);
    const bytes = zipBuffer(); const allocation = await storage.allocate(bytes.length);
    await allocation.handle.writeFile(bytes); await allocation.handle.sync(); await allocation.handle.close();
    await storage.retain(allocation.name, allocation.finalName);
    const { file, stat } = await storage.safeFile(allocation.finalName);
    assert.equal(stat.size, bytes.length);
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),
      crypto.createHash('sha256').update(bytes).digest('hex'));
    await storage.cleanupDownloads(allocation.finalName);
    assert.deepEqual((await fs.readdir(cacheRoot)).sort(), ['cache.json', allocation.finalName, 'unrelated.txt'].sort());
    await storage.cleanupDownloads();
    assert.deepEqual((await fs.readdir(cacheRoot)).sort(), ['cache.json', 'unrelated.txt']);
  });
});

test('real storage refuses unsafe cache ancestry, junctions and hardlinked cache files without external writes', async (t) => {
  await withStorageDiagnostics(t, async () => {
    const { root, appRoot, cacheRoot } = await workspace(t);
    assert.throws(() => new UpdateStorage(path.join(appRoot, 'updates'), appRoot), { code: 'unsafe-path' });
    const outside = path.join(root, 'outside'); await fs.mkdir(outside);
    const linked = path.join(root, 'linked'); await fs.symlink(outside, linked, 'junction');
    const storage = new UpdateStorage(path.join(linked, 'updates'), appRoot);
    await assert.rejects(storage.prepare(), { code: 'unsafe-path' });
    assert.deepEqual(await fs.readdir(outside), []);
    const externalFile = path.join(outside, 'config.json'); await fs.writeFile(externalFile, 'preserved');
    await fs.mkdir(cacheRoot); await fs.link(externalFile, path.join(cacheRoot, 'cache.json'));
    const poisoned = new UpdateStorage(cacheRoot, appRoot);
    await assert.rejects(poisoned.readCache(), { code: 'unsafe-path' });
    await assert.rejects(poisoned.saveCache({ arbitrary: true }), { code: 'unsafe-path' });
    assert.equal(await fs.readFile(externalFile, 'utf8'), 'preserved');
  });
});

test('production host factory connects the bundled installer and refuses a synthetic noninstalled target', { skip: process.platform !== 'win32' }, async (t) => {
  await withStorageDiagnostics(t, async () => {
    const { root, appRoot } = await workspace(t); const bytes = zipBuffer();
    const updater = createHostUpdateService({ app: { getPath: () => root }, appRoot,
      host: { kind: 'workflow', execPath: process.execPath } });
    t.after(() => updater.dispose());
    updater.discover = async () => [release(bytes)];
    updater.open = async (_url, { signal }) => response(bytes, signal);
    await updater.ready;
    const checked = await updater.checkForUpdates();
    assert.equal(checked.status, 'available', JSON.stringify(checked));
    const downloaded = await updater.downloadUpdate();
    assert.equal(downloaded.status, 'downloaded', JSON.stringify(downloaded));
    const expected = { status: 'unavailable', reason: 'target-unverified' };
    assert.deepEqual(updater.getState().installation, expected);
    assert.deepEqual((await updater.prepareUpdateInstall()).installation, expected);
    assert.deepEqual((await updater.confirmUpdateInstall()).installation, expected);
    assert.deepEqual((await fs.readdir(root)).sort(), ['app', 'workflow-updates']);
  });
});

test('fixed independent executor and recovery CLI reject development code before writes', { skip: process.platform !== 'win32' }, (t) => {
  const scriptRoot = path.resolve(__dirname, '../../../scripts/workflow-update');
  for (const name of ['executor.ps1', 'recover.ps1']) {
    const started = Date.now();
    const child = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(scriptRoot, name), '-RequestId', 'a'.repeat(32)],
      { windowsHide: true, encoding: 'utf8', timeout: 15000 });
    const diagnostic = JSON.stringify({ script: name, elapsedMs: Date.now() - started, timeoutMs: 15000,
      status: child.status, signal: child.signal,
      error: child.error ? { code: child.error.code, message: child.error.message } : null,
      stdout: child.stdout, stderr: child.stderr });
    t.diagnostic(diagnostic);
    assert.equal(child.error, undefined, diagnostic);
    assert.equal(child.signal, null, diagnostic);
    assert.equal(child.status, 1, diagnostic);
    let result;
    try { result = JSON.parse(child.stdout.trim()); }
    catch { assert.fail(`Invalid CLI JSON: ${diagnostic}`); }
    assert.equal(result.id, 'a'.repeat(32), diagnostic);
    assert.equal(result.status, 'failed', diagnostic);
    assert.equal(result.reason, 'target-unverified', diagnostic);
  }
  assert.equal(require('node:fs').existsSync(path.join(scriptRoot, 'result.json')), false);
});
