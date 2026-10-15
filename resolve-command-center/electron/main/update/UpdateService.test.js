const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { UpdateService, createHostUpdateService } = require('./UpdateService');
const { failure } = require('./identity');
const { UpdateStorage } = require('./storage');
const { zipBuffer, payload, release, response, workspace } = require('./fixtures');
async function service(t, options = {}) {
  const roots = await workspace(t); const bytes = zipBuffer();
  const updater = new UpdateService({ ...roots, platform: 'win32', discover: async () => [release(bytes)],
    open: async (_url, { signal }) => response(bytes, signal), ...options });
  t.after(() => updater.dispose()); await updater.ready;
  return { updater, bytes, ...roots };
}
async function beginWithProgress(updater) {
  let off;
  const progress = new Promise((resolve) => { off = updater.subscribe((state) => { if (state.receivedBytes > 0) resolve(); }); });
  const download = updater.downloadUpdate();
  try {
    await Promise.race([progress, download.then((state) => {
      throw new Error(`Download ended before stream progress: ${JSON.stringify(state)}`);
    })]);
  } finally { off(); }
  return { download };
}
test('check/download verifies actual streamed ZIP/hash and snapshots carry no path authority', async (t) => {
  const { updater, cacheRoot } = await service(t); const states = [];
  updater.subscribe((state) => { states.push(state.status); state.status = 'tampered'; });
  assert.equal((await updater.checkForUpdates()).status, 'available');
  const state = await updater.downloadUpdate();
  assert.equal(state.status, 'downloaded'); assert.equal(state.receivedBytes, state.totalBytes);
  assert.deepEqual(Object.keys(state), ['schemaVersion', 'status', 'currentVersion', 'latestVersion', 'releaseNotes',
    'checkedAt', 'retryAt', 'receivedBytes', 'totalBytes', 'error', 'downloadedVersion', 'installation']);
  assert.equal(state.downloadedVersion, '0.2.0');
  assert.deepEqual(state.installation, { status: 'unavailable', reason: 'qualification-required' });
  assert.ok(states.includes('verifying'));
  assert.equal((await fs.readdir(cacheRoot)).filter((file) => file.endsWith('.zip')).length, 1);
  assert.equal((await updater.checkForUpdates()).status, 'downloaded');
});
test('concurrent checks coalesce, daily auto cache persists, manual check refreshes', async (t) => {
  let calls = 0; let time = 1000000;
  const { updater, appRoot, cacheRoot } = await service(t, { now: () => time, discover: async () => { calls++; return []; } });
  const results = await Promise.all([updater.checkForUpdates(), updater.checkForUpdates(), updater.downloadUpdate()]);
  assert.ok(results.every((result) => result.status === 'no-release')); assert.equal(calls, 1);
  await updater.checkForUpdates({ automatic: true }); assert.equal(calls, 1);
  await updater.checkForUpdates(); assert.equal(calls, 2);
  await updater.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32', now: () => time, discover: async () => { calls++; return []; } });
  t.after(() => restarted.dispose()); await restarted.ready;
  assert.equal(restarted.getState().status, 'no-release'); await restarted.checkForUpdates({ automatic: true }); assert.equal(calls, 2);
  time += 86400001; await restarted.checkForUpdates({ automatic: true }); assert.equal(calls, 3);
});
test('verified completed download survives restart after rehash; changed cache bytes cannot stay downloaded', async (t) => {
  const { updater, appRoot, cacheRoot } = await service(t);
  await updater.checkForUpdates(); await updater.downloadUpdate(); await updater.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32' });
  await restarted.ready; assert.equal(restarted.getState().status, 'downloaded');
  await restarted.dispose();
  const zip = (await fs.readdir(cacheRoot)).find((name) => name.endsWith('.zip'));
  const data = await fs.readFile(path.join(cacheRoot, zip)); data[0] ^= 1; await fs.writeFile(path.join(cacheRoot, zip), data);
  const corrupted = new UpdateService({ appRoot, cacheRoot, platform: 'win32' }); t.after(() => corrupted.dispose());
  await corrupted.ready; assert.equal(corrupted.getState().error.code, 'checksum');
  assert.equal((await fs.readdir(cacheRoot)).some((name) => name.endsWith('.zip')), false);
});
test('rate-limit/timeout/offline backoff persists and suppresses manual retries until allowed', async (t) => {
  let time = 1000000; let calls = 0;
  const { updater, appRoot, cacheRoot } = await service(t, { now: () => time, discover: async () => { calls++; throw failure('rate-limit', time + 120000); } });
  const state = await updater.checkForUpdates(); assert.equal(state.error.code, 'rate-limit');
  await updater.checkForUpdates(); assert.equal(calls, 1); await updater.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32', now: () => time,
    discover: async () => { calls++; throw failure('network'); } });
  t.after(() => restarted.dispose()); await restarted.ready;
  await restarted.checkForUpdates(); assert.equal(calls, 1); time += 120001;
  assert.equal((await restarted.checkForUpdates()).error.code, 'network'); assert.equal(calls, 2);
  assert.ok(restarted.getState().retryAt > time);
});
test('check deadline aborts a pending network request and reports a retryable timeout', async (t) => {
  let started; const pending = new Promise((resolve) => { started = resolve; });
  const { updater } = await service(t, { checkTimeout: 20, discover: ({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    started();
  }) });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const checking = updater.checkForUpdates(); await pending;
  t.mock.timers.tick(20);
  const state = await checking;
  assert.equal(state.error.code, 'timeout'); assert.ok(state.retryAt > state.checkedAt);
});
test('automatic check recovers immediately after failure backoff, including a restart', async (t) => {
  let time = 1000000;
  const { updater, appRoot, cacheRoot } = await service(t, { now: () => time,
    discover: async () => { throw failure('rate-limit', time + 120000); } });
  assert.equal((await updater.checkForUpdates()).error.code, 'rate-limit');
  await updater.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32', now: () => time, discover: async () => [] });
  t.after(() => restarted.dispose()); await restarted.ready;
  assert.equal((await restarted.checkForUpdates({ automatic: true })).error.code, 'rate-limit');
  time += 120001;
  assert.equal((await restarted.checkForUpdates({ automatic: true })).status, 'no-release');
});
test('invalid release metadata cache cleans generated orphans without blocking a fresh check', async (t) => {
  const roots = await workspace(t); await fs.mkdir(roots.cacheRoot);
  await fs.writeFile(path.join(roots.cacheRoot, 'b'.repeat(32) + '.zip'), 'unverified');
  await fs.writeFile(path.join(roots.cacheRoot, 'unrelated.txt'), 'preserve');
  await fs.writeFile(path.join(roots.cacheRoot, 'cache.json'), JSON.stringify({ schemaVersion: 1,
    currentVersion: '0.1.0', checkedAt: 1000, failures: 0, retryAt: null, releases: {} }));
  const updater = new UpdateService({ ...roots, platform: 'win32', discover: async () => [] });
  t.after(() => updater.dispose()); await updater.ready;
  assert.equal(updater.getState().status, 'idle');
  assert.deepEqual((await fs.readdir(roots.cacheRoot)).sort(), ['cache.json', 'unrelated.txt']);
  assert.equal((await updater.checkForUpdates({ automatic: true })).status, 'no-release');
});
test('checksum mismatch, truncated/oversized streams clean owned partials and retry cleanly', async (t) => {
  let mode = 'checksum';
  const { updater, bytes, cacheRoot } = await service(t, { open: async (_url, { signal }) => {
    const data = mode === 'checksum' ? Buffer.alloc(bytes.length) : mode === 'short' ? bytes.subarray(0, 20)
      : mode === 'oversize' ? Buffer.concat([bytes, Buffer.from('x')]) : bytes;
    const stream = response(data, signal); stream.headers = {}; return stream;
  } });
  await updater.checkForUpdates();
  for (const [next, code] of [['checksum', 'checksum'], ['short', 'size-limit'], ['oversize', 'size-limit']]) {
    mode = next; assert.equal((await updater.downloadUpdate()).error.code, code);
    assert.deepEqual((await fs.readdir(cacheRoot)).filter((file) => /\.(part|zip)$/.test(file)), []);
  }
  mode = 'valid'; assert.equal((await updater.downloadUpdate()).status, 'downloaded');
});
test('download cancel and timeout abort network, clean partials, preserve selected release for retry', async (t) => {
  let stream; let mode = 'hang';
  const { updater, bytes, cacheRoot } = await service(t, { downloadTimeout: 1000, open: async (_url, { signal }) => {
    if (mode === 'valid') return response(bytes, signal);
    stream = new PassThrough(); stream.headers = {}; stream.write(bytes.subarray(0, 100));
    signal.addEventListener('abort', () => stream.destroy(signal.reason), { once: true });
    return stream;
  } });
  await updater.checkForUpdates();
  // Network timing must not include wall-clock contention while the real
  // Windows filesystem guards start their PowerShell probes. Keep all guards,
  // then advance the deadline only after observable stream progress.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { download } = await beginWithProgress(updater);
  const cancelled = await updater.cancelUpdate(); assert.equal(cancelled.status, 'cancelled'); await download;
  assert.ok(stream.destroyed); assert.equal((await fs.readdir(cacheRoot)).some((name) => name.endsWith('.part')), false);
  const timed = await beginWithProgress(updater);
  t.mock.timers.tick(1000);
  assert.equal((await timed.download).error.code, 'timeout');
  assert.ok(stream.destroyed);
  assert.equal((await fs.readdir(cacheRoot)).some((name) => name.endsWith('.part')), false);
  mode = 'valid'; assert.equal((await updater.downloadUpdate()).status, 'downloaded');
});
test('space, unsafe cache ancestor and poisoned cache file fail closed without a download', async (t) => {
  const { updater, cacheRoot, appRoot, root } = await service(t, { space: async () => ({ bavail: 0, bsize: 4096 }) });
  await updater.checkForUpdates(); assert.equal((await updater.downloadUpdate()).error.code, 'disk-space');
  assert.equal((await fs.readdir(cacheRoot)).some((name) => name.endsWith('.part')), false);
  assert.throws(() => new UpdateStorage(path.join(appRoot, 'updates'), appRoot), { code: 'unsafe-path' });
  const outside = path.join(root, 'outside'); await fs.mkdir(outside);
  const linked = path.join(root, 'linked'); await fs.symlink(outside, linked, 'junction');
  const storage = new UpdateStorage(path.join(linked, 'updates'), appRoot);
  await assert.rejects(storage.prepare(), { code: 'unsafe-path' });
  assert.deepEqual(await fs.readdir(outside), []);
  await updater.dispose();
  const externalFile = path.join(outside, 'config.json'); await fs.writeFile(externalFile, 'preserved');
  await fs.unlink(path.join(cacheRoot, 'cache.json')); await fs.link(externalFile, path.join(cacheRoot, 'cache.json'));
  const poisoned = new UpdateStorage(cacheRoot, appRoot);
  await assert.rejects(poisoned.readCache(), { code: 'unsafe-path' });
  await assert.rejects(poisoned.saveCache({ arbitrary: true }), { code: 'unsafe-path' });
  assert.equal(await fs.readFile(externalFile, 'utf8'), 'preserved');
});
test('restart removes only task-generated orphan ZIP/partials; corrupt cache does not invent availability', async (t) => {
  const roots = await workspace(t); await fs.mkdir(roots.cacheRoot);
  await fs.writeFile(path.join(roots.cacheRoot, 'a'.repeat(32) + '.part'), 'partial');
  await fs.writeFile(path.join(roots.cacheRoot, 'b'.repeat(32) + '.zip'), 'unverified');
  await fs.writeFile(path.join(roots.cacheRoot, 'unrelated.txt'), 'preserve');
  await fs.writeFile(path.join(roots.cacheRoot, 'cache.json'), '{malformed');
  const updater = new UpdateService({ ...roots, platform: 'win32', discover: async () => [] }); t.after(() => updater.dispose());
  await updater.ready; assert.equal(updater.getState().status, 'idle');
  assert.deepEqual((await fs.readdir(roots.cacheRoot)).sort(), ['cache.json', 'unrelated.txt']);
});
test('dispose aborts in-flight download without emitting stale states after host exit', async (t) => {
  let stream;
  const { updater, bytes, cacheRoot } = await service(t, { open: async (_url, { signal }) => {
    stream = new PassThrough(); stream.headers = {}; stream.write(bytes.subarray(0, 50));
    signal.addEventListener('abort', () => stream.destroy(signal.reason), { once: true }); return stream;
  } });
  await updater.checkForUpdates();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const states = []; updater.subscribe((state) => states.push(state));
  const { download } = await beginWithProgress(updater);
  const beforeExit = structuredClone(states);
  await updater.dispose(); await download;
  assert.ok(stream.destroyed);
  assert.deepEqual(states, beforeExit);
  assert.equal((await fs.readdir(cacheRoot)).some((name) => name.endsWith('.part')), false);
});
test('manual recheck preserves exact candidate across newer discovery/restart; explicit discard downloads new bytes', async (t) => {
  let calls = 0; let downloads = 0; let current = '0.2.0';
  const versions = { '0.2.0': zipBuffer(), '0.3.0': zipBuffer(payload('0.3.0')) };
  const { updater, appRoot, cacheRoot } = await service(t, { discover: async () => { calls++; return [release(versions[current], current)]; },
    open: async (_url, { signal }) => { downloads++; return response(versions[current], signal); } });
  await updater.checkForUpdates(); const downloaded = await updater.downloadUpdate();
  assert.equal(downloaded.status, 'downloaded', JSON.stringify(downloaded));
  const candidateName = updater.downloadedName; const candidateBytes = await fs.readFile(path.join(cacheRoot, candidateName));
  current = '0.3.0';
  await updater.checkForUpdates({ automatic: true }); assert.equal(calls, 1);
  const checked = await updater.checkForUpdates(); assert.equal(calls, 2);
  assert.equal(checked.latestVersion, '0.3.0'); assert.equal(checked.downloadedVersion, '0.2.0');
  await updater.downloadUpdate(); assert.equal(downloads, 1);
  assert.equal(updater.downloadedName, candidateName);
  assert.deepEqual(await fs.readFile(path.join(cacheRoot, candidateName)), candidateBytes);
  await updater.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32',
    open: async (_url, { signal }) => { downloads++; return response(versions[current], signal); } });
  t.after(() => restarted.dispose()); await restarted.ready;
  assert.equal(restarted.getState().latestVersion, '0.3.0');
  assert.equal(restarted.getState().downloadedVersion, '0.2.0');
  assert.equal(restarted.downloadedName, candidateName);
  assert.equal((await restarted.discardUpdate()).status, 'available');
  assert.equal(restarted.getState().downloadedVersion, null);
  assert.equal((await fs.readdir(cacheRoot)).includes(candidateName), false);
  assert.equal(JSON.parse(await fs.readFile(path.join(cacheRoot, 'cache.json'), 'utf8')).downloaded, null);
  assert.equal((await restarted.downloadUpdate()).downloadedVersion, '0.3.0');
  assert.equal(downloads, 2); assert.notEqual(restarted.downloadedName, candidateName);
});
test('failed candidate recheck retains bytes and version over restart while rate limiting further requests', async (t) => {
  let fail = false; let calls = 0; let time = 1000000;
  const { updater, bytes, appRoot, cacheRoot } = await service(t, { now: () => time,
    discover: async () => { calls++; if (fail) throw failure('network'); return [release(bytes)]; } });
  await updater.checkForUpdates(); const downloaded = await updater.downloadUpdate();
  assert.equal(downloaded.status, 'downloaded', JSON.stringify(downloaded));
  const name = updater.downloadedName; fail = true;
  const state = await updater.checkForUpdates();
  assert.equal(calls, 2); assert.equal(state.status, 'downloaded'); assert.equal(state.error.code, 'network');
  assert.equal(state.downloadedVersion, '0.2.0'); assert.deepEqual(await fs.readFile(path.join(cacheRoot, name)), bytes);
  await updater.checkForUpdates(); assert.equal(calls, 2); await updater.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32', now: () => time,
    discover: async () => { calls++; return []; } });
  t.after(() => restarted.dispose()); await restarted.ready;
  assert.equal(restarted.getState().downloadedVersion, '0.2.0');
  assert.equal(restarted.getState().error.code, 'network');
  await restarted.checkForUpdates(); assert.equal(calls, 2);
  time += 60001; await restarted.checkForUpdates(); assert.equal(calls, 3);
  assert.equal(restarted.getState().latestVersion, null); assert.equal(restarted.getState().downloadedVersion, '0.2.0');
});
test('failed discard persistence leaves the candidate usable; successful discard remains cleared after restart', async (t) => {
  const { updater, appRoot, cacheRoot } = await service(t);
  await updater.checkForUpdates(); await updater.downloadUpdate(); const name = updater.downloadedName;
  const save = updater.storage.saveCache.bind(updater.storage);
  updater.storage.saveCache = async () => { throw failure('storage'); };
  const refused = await updater.discardUpdate(); assert.equal(refused.error.code, 'storage');
  assert.equal(refused.downloadedVersion, '0.2.0'); assert.equal(updater.downloadedName, name);
  assert.ok((await fs.readdir(cacheRoot)).includes(name));
  updater.storage.saveCache = save; await updater.discardUpdate(); await updater.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32' });
  t.after(() => restarted.dispose()); await restarted.ready;
  assert.equal(restarted.getState().downloadedVersion, null); assert.equal(restarted.getState().status, 'available');
});
test('manual recheck and discard invalidate host confirmation; production default cannot install', async (t) => {
  let starts = 0;
  const { updater } = await service(t, { installer: { qualify: async () => ({ ready: true }),
    start: async () => { starts++; return { status: 'installed' }; } } });
  await updater.checkForUpdates(); await updater.downloadUpdate();
  assert.equal((await updater.prepareUpdateInstall()).installation.status, 'awaiting-confirmation');
  await updater.checkForUpdates(); await updater.confirmUpdateInstall(); assert.equal(starts, 0);
  await updater.prepareUpdateInstall(); await updater.discardUpdate(); await updater.confirmUpdateInstall(); assert.equal(starts, 0);
  const { updater: unqualified } = await service(t);
  await unqualified.checkForUpdates(); await unqualified.downloadUpdate();
  assert.equal((await unqualified.prepareUpdateInstall()).installation.status, 'unavailable');
  assert.equal((await unqualified.confirmUpdateInstall()).installation.status, 'unavailable');
});
test('host shutdown completes while the independent executor waits for host exit', async (t) => {
  let finish; let signal;
  const { updater } = await service(t, { installer: { qualify: async () => ({ ready: true }),
    start: (_candidate, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); } } });
  await updater.checkForUpdates(); await updater.downloadUpdate(); await updater.prepareUpdateInstall();
  const waiting = new Promise((resolve) => { const off = updater.subscribe((state) => {
    if (state.installation.status === 'waiting-for-exit') { off(); resolve(); }
  }); });
  const installing = updater.confirmUpdateInstall(); await waiting;
  await updater.dispose(); assert.equal(signal.aborted, false);
  finish({ status: 'installed' }); await installing;
  // No stale success is published from a host that has already shut down.
  assert.equal(updater.getState().installation.status, 'waiting-for-exit');
});
test('independent install waiting has no discovery deadline and acknowledges cancellation through the public service', async (t) => {
  let finish; let signal;
  const { updater } = await service(t, { installer: { qualify: async () => ({ ready: true }),
    start: (_candidate, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
    cancel: async () => { const result = { status: 'cancelled', reason: null }; finish(result); return result; } } });
  await updater.checkForUpdates(); await updater.downloadUpdate(); await updater.prepareUpdateInstall();
  updater.checkTimeout = 10;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const waiting = new Promise((resolve) => { const off = updater.subscribe((state) => {
    if (state.installation.status === 'waiting-for-exit') { off(); resolve(); }
  }); });
  const confirmation = updater.confirmUpdateInstall(); await waiting;
  t.mock.timers.tick(updater.checkTimeout + 1);
  assert.equal(signal.aborted, false, 'waiting for user exit is not a network timeout');
  assert.equal(updater.getState().installation.status, 'waiting-for-exit');
  assert.equal((await updater.cancelUpdateInstall()).installation.status, 'cancelled');
  assert.equal((await confirmation).installation.status, 'cancelled');
  assert.equal(updater.getState().downloadedVersion, '0.2.0');
  assert.equal((await updater.prepareUpdateInstall()).installation.status, 'awaiting-confirmation');
});
test('R1 candidate cache migration preserves original identity after newer recheck and another restart', async (t) => {
  const { updater, appRoot, cacheRoot } = await service(t);
  await updater.checkForUpdates(); await updater.downloadUpdate(); const name = updater.downloadedName; await updater.dispose();
  const cacheFile = path.join(cacheRoot, 'cache.json');
  const r1 = JSON.parse(await fs.readFile(cacheFile, 'utf8')); delete r1.downloaded.releases;
  await fs.writeFile(cacheFile, JSON.stringify(r1));
  const newer = zipBuffer(payload('0.3.0'));
  const migrated = new UpdateService({ appRoot, cacheRoot, platform: 'win32', discover: async () => [release(newer, '0.3.0')] });
  await migrated.ready; assert.equal(migrated.getState().downloadedVersion, '0.2.0');
  await migrated.checkForUpdates(); await migrated.dispose();
  const restarted = new UpdateService({ appRoot, cacheRoot, platform: 'win32' });
  t.after(() => restarted.dispose()); await restarted.ready;
  assert.equal(restarted.getState().latestVersion, '0.3.0');
  assert.equal(restarted.getState().downloadedVersion, '0.2.0'); assert.equal(restarted.downloadedName, name);
});
test('production host factory connects the bundled installer and refuses a synthetic noninstalled target', { skip: process.platform !== 'win32' }, async (t) => {
  const { root, appRoot } = await workspace(t); const bytes = zipBuffer();
  const updater = createHostUpdateService({ app: { getPath: () => root }, appRoot,
    host: { kind: 'workflow', execPath: process.execPath } });
  t.after(() => updater.dispose());
  updater.discover = async () => [release(bytes)];
  updater.open = async (_url, { signal }) => response(bytes, signal);
  await updater.ready; await updater.checkForUpdates(); await updater.downloadUpdate();
  const expected = { status: 'unavailable', reason: 'target-unverified' };
  assert.deepEqual(updater.getState().installation, expected);
  assert.deepEqual((await updater.prepareUpdateInstall()).installation, expected);
  assert.deepEqual((await updater.confirmUpdateInstall()).installation, expected);
  assert.deepEqual((await fs.readdir(root)).sort(), ['app', 'workflow-updates']);
});
test('ready restores validated adapter outcomes even when candidate cache belongs to the previous installed version', async (t) => {
  for (const state of [{ status: 'installed', reason: null }, { status: 'rolled-back', reason: 'install-failed' },
    { status: 'failed', reason: 'recovery-required' }, { status: 'cancelled', reason: null }]) {
    const { updater } = await service(t, { storage: { readCache: async () => ({ schemaVersion: 1, currentVersion: '0.0.1' }),
      cleanupDownloads: async () => {} }, installer: { readState: async () => ({ ...state, target: 'C:/private' }) } });
    assert.deepEqual(updater.getState().installation, state);
    assert.equal(JSON.stringify(updater.getState()).includes('C:/private'), false);
    await updater.dispose();
  }
});
test('writable cached installation claims cannot become a restored successful install', async (t) => {
  const { updater } = await service(t, { storage: { readCache: async () => ({ schemaVersion: 1, currentVersion: '0.1.0',
    checkedAt: 1, failures: 0, retryAt: null, releases: [], installation: { status: 'installed', reason: null } }),
  cleanupDownloads: async () => {} }, installer: { readState: async () => null } });
  assert.deepEqual(updater.getState().installation, { status: 'unavailable', reason: 'no-candidate' });
});
