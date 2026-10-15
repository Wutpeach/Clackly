const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { failure, installedVersion, selectRelease } = require('./identity');
const { readReleases, openResponse } = require('./network');
const { UpdateStorage } = require('./storage');
const { verifyZip } = require('./zip');
const { InstallCoordinator } = require('./InstallCoordinator');
const DAY = 86400000;
const ERROR_CODES = new Set(['invalid-version', 'invalid-source', 'invalid-response', 'invalid-asset', 'invalid-zip',
  'unsafe-path', 'disk-space', 'checksum', 'size-limit', 'timeout', 'rate-limit', 'network', 'storage', 'cancelled']);
function publicError(error) {
  if (ERROR_CODES.has(error?.code)) return error.code;
  if (error?.code === 'ENOSPC') return 'disk-space';
  return ['EACCES', 'EPERM', 'EIO', 'EROFS'].includes(error?.code) ? 'storage' : 'network';
}
class UpdateService {
  constructor({ appRoot, cacheRoot, platform = process.platform, now = Date.now,
    discover = readReleases, open = openResponse, storage, space, verify = verifyZip,
    checkTimeout = 30000, downloadTimeout = 10 * 60000, installer } = {}) {
    this.now = now;
    this.discover = discover;
    this.open = open;
    this.space = space;
    this.verify = verify;
    this.storage = storage || new UpdateStorage(cacheRoot, appRoot);
    this.checkTimeout = checkTimeout;
    this.downloadTimeout = downloadTimeout;
    this.listeners = new Set();
    this.active = null;
    this.disposed = false;
    this.release = null;
    this.downloadedName = null;
    this.candidate = null;
    this.failures = 0;
    this.cache = null;
    const currentVersion = installedVersion(appRoot);
    this.snapshot = { schemaVersion: 1, status: platform !== 'win32' || !currentVersion ? 'unavailable' : 'idle',
      currentVersion, latestVersion: null, releaseNotes: '', checkedAt: null, retryAt: null,
      receivedBytes: 0, totalBytes: 0, error: platform !== 'win32' ? { code: 'unsupported-platform' }
        : !currentVersion ? { code: 'invalid-version' } : null };
    this.snapshot.downloadedVersion = null;
    this.snapshot.installation = { status: 'unavailable', reason: 'no-candidate' };
    this.installation = new InstallCoordinator({ installer, publish: (installation) => this.publish({ installation }) });
    this.supported = this.snapshot.status === 'idle';
    this.ready = this.initialize().then(() => this.installation.restore());
  }
  getState() { return structuredClone(this.snapshot); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish(patch) {
    if (this.disposed) return;
    Object.assign(this.snapshot, patch);
    for (const listener of this.listeners) { try { listener(this.getState()); } catch { /* UI lifetime is independent. */ } }
  }
  async initialize() {
    if (!this.supported) return;
    try {
      const cache = await this.storage.readCache();
      if (this.disposed) return;
      if (cache?.schemaVersion !== 1 || cache.currentVersion !== this.snapshot.currentVersion
        || !Number.isSafeInteger(cache.checkedAt) || cache.checkedAt < 0 || cache.checkedAt > this.now()
        || !Number.isSafeInteger(cache.failures) || cache.failures < 0 || cache.failures > 10
        || cache.retryAt !== null && (!Number.isSafeInteger(cache.retryAt) || cache.retryAt > this.now() + 7 * DAY)) {
        await this.storage.cleanupDownloads();
        return;
      }
      if (cache.releases) {
        let selection;
        try { selection = selectRelease(cache.releases, this.snapshot.currentVersion); }
        catch { await this.storage.cleanupDownloads(); return; }
        this.applySelection(selection);
      }
      if (cache.error && ERROR_CODES.has(cache.error.code)) this.publish({ status: 'error', error: { code: cache.error.code } });
      this.cache = cache;
      this.failures = cache.failures;
      this.publish({ checkedAt: cache.checkedAt, retryAt: cache.retryAt });
      const downloaded = cache.downloaded;
      let retainedRelease = null;
      if (downloaded) {
        try { retainedRelease = selectRelease(downloaded.releases || cache.releases, this.snapshot.currentVersion).release; } catch { /* Invalid candidate metadata is never restored. */ }
      }
      if (retainedRelease && downloaded && /^[a-f0-9]{32}\.zip$/.test(downloaded.name || '')
        && downloaded.version === retainedRelease.version && downloaded.digest === retainedRelease.digest && downloaded.size === retainedRelease.size) {
        try {
          const { file, stat } = await this.storage.safeFile(downloaded.name);
          if (stat.size !== retainedRelease.size) throw failure('size-limit');
          const hash = crypto.createHash('sha256');
          let received = 0;
          for await (const chunk of fs.createReadStream(file)) {
            received += chunk.length;
            if (received > retainedRelease.size) throw failure('size-limit');
            hash.update(chunk);
          }
          if (received !== retainedRelease.size || hash.digest('hex') !== retainedRelease.digest) throw failure('checksum');
          await this.verify(file, retainedRelease.version);
          this.downloadedName = downloaded.name;
          // Migrate R1 candidates before any discovery can replace their original metadata.
          const retained = { ...downloaded, releases: downloaded.releases || cache.releases };
          this.cache = { ...this.cache, downloaded: retained };
          this.candidate = { ...retained, release: retainedRelease, file };
          this.publish({ status: 'downloaded', downloadedVersion: retainedRelease.version, receivedBytes: received, totalBytes: received });
          await this.installation.setCandidate(this.candidate);
        } catch (error) {
          if (error.code !== 'ENOENT') this.publish({ status: 'error', error: { code: publicError(error) } });
        }
      }
      await this.storage.cleanupDownloads(this.downloadedName);
    } catch (error) { this.publish({ status: 'error', error: { code: publicError(error) } }); }
  }
  applySelection(selection) {
    this.release = selection.status === 'available' ? selection.release : null;
    this.publish({ status: this.downloadedName ? 'downloaded' : selection.status, latestVersion: selection.release?.version || null,
      releaseNotes: selection.release?.notes || '', error: selection.error || null,
      ...(!this.downloadedName ? { receivedBytes: 0, totalBytes: 0 } : {}) });
  }
  run(kind, action, timeout) {
    if (this.active) return this.active.promise;
    if (this.disposed || !this.supported) return Promise.resolve(this.getState());
    const controller = new AbortController();
    const timer = timeout === null ? null : setTimeout(() => controller.abort(failure('timeout')), timeout);
    const active = { kind, controller, timer, promise: null };
    this.active = active;
    active.promise = (async () => {
      try { await this.ready; controller.signal.throwIfAborted(); await action(controller.signal); }
      catch (error) {
        const code = publicError(controller.signal.aborted ? controller.signal.reason : error);
        this.publish({ status: this.downloadedName ? 'downloaded' : code === 'cancelled' ? 'cancelled' : 'error',
          error: code === 'cancelled' ? null : { code } });
      } finally { clearTimeout(timer); if (this.active === active) this.active = null; }
      return this.getState();
    })();
    return active.promise;
  }
  checkForUpdates({ automatic = false } = {}) {
    return this.run('check', async (signal) => {
      if (this.installation.isRunning()) return;
      if (this.snapshot.retryAt && this.now() < this.snapshot.retryAt) return;
      if (automatic && !this.cache?.error && this.snapshot.checkedAt !== null && this.now() - this.snapshot.checkedAt < DAY) return;
      if (automatic && this.downloadedName) return;
      this.installation.invalidateConfirmation();
      this.publish({ status: 'checking', error: null, ...(!this.downloadedName ? { receivedBytes: 0, totalBytes: 0 } : {}) });
      try {
        const releases = await this.discover({ signal });
        signal.throwIfAborted();
        const selection = selectRelease(releases, this.snapshot.currentVersion);
        this.failures = 0;
        this.applySelection(selection);
        this.publish({ checkedAt: this.now(), retryAt: null });
        this.cache = { schemaVersion: 1, currentVersion: this.snapshot.currentVersion, checkedAt: this.snapshot.checkedAt,
          retryAt: null, failures: 0, releases, downloaded: this.cache?.downloaded || null };
      } catch (error) {
        const code = publicError(signal.aborted ? signal.reason : error);
        if (this.disposed) return;
        this.failures = Math.min(10, this.failures + 1);
        const retryAt = error.retryAt || this.now() + Math.min(6 * 3600000, 60000 * 2 ** (this.failures - 1));
        this.publish({ status: this.downloadedName ? 'downloaded' : 'error', error: { code }, checkedAt: this.now(), retryAt });
        this.cache = { schemaVersion: 1, currentVersion: this.snapshot.currentVersion, checkedAt: this.snapshot.checkedAt,
          retryAt, failures: this.failures, releases: this.cache?.releases || null, error: { code }, downloaded: this.cache?.downloaded || null };
      }
      if (!this.disposed) {
        try { await this.storage.saveCache(this.cache); } catch (error) {
          this.publish({ status: this.downloadedName ? 'downloaded' : 'error', error: { code: publicError(error) } });
        }
      }
    }, this.checkTimeout);
  }
  downloadUpdate() {
    return this.run('download', async (signal) => {
      if (!this.release || this.downloadedName || this.snapshot.retryAt && this.now() < this.snapshot.retryAt) return;
      const release = this.release;
      this.publish({ status: 'downloading', error: null, receivedBytes: 0, totalBytes: release.size });
      let allocation;
      let response;
      let complete = false;
      try {
        allocation = await this.storage.allocate(release.size, this.space);
        signal.throwIfAborted();
        response = await this.open(release.url, { kind: 'asset', signal });
        const advertised = response.headers['content-length'];
        if (advertised !== undefined && (!/^\d+$/.test(advertised) || Number(advertised) !== release.size)) throw failure('size-limit');
        const hash = crypto.createHash('sha256');
        let received = 0;
        let publishedAt = 0;
        for await (const chunk of response) {
          signal.throwIfAborted();
          received += chunk.length;
          if (received > release.size) throw failure('size-limit');
          hash.update(chunk);
          let offset = 0;
          while (offset < chunk.length) {
            const { bytesWritten } = await allocation.handle.write(chunk, offset, chunk.length - offset);
            if (!bytesWritten) throw failure('storage');
            offset += bytesWritten;
          }
          this.snapshot.receivedBytes = received;
          if (received === release.size || this.now() - publishedAt >= 100) {
            publishedAt = this.now();
            this.publish({ receivedBytes: received });
          }
        }
        signal.throwIfAborted();
        if (received !== release.size) throw failure('size-limit');
        await allocation.handle.sync();
        await allocation.handle.close();
        allocation.handle = null;
        this.publish({ status: 'verifying' });
        if (hash.digest('hex') !== release.digest) throw failure('checksum');
        await this.storage.safeFile(allocation.name);
        await this.verify(this.storage.file(allocation.name), release.version, { signal });
        signal.throwIfAborted();
        await this.storage.retain(allocation.name, allocation.finalName);
        signal.throwIfAborted();
        const cache = { ...this.cache, downloaded: { name: allocation.finalName, version: release.version,
          digest: release.digest, size: release.size, releases: this.cache.releases } };
        await this.storage.saveCache(cache);
        signal.throwIfAborted();
        this.cache = cache;
        this.downloadedName = allocation.finalName;
        this.candidate = { ...cache.downloaded, release, file: this.storage.file(allocation.finalName) };
        complete = true;
        this.publish({ status: 'downloaded', downloadedVersion: release.version, retryAt: null });
        await this.installation.setCandidate(this.candidate);
      } catch (error) {
        if (error.retryAt) {
          this.publish({ retryAt: error.retryAt });
          if (this.cache) {
            this.cache = { ...this.cache, retryAt: error.retryAt, error: { code: publicError(error) } };
            await this.storage.saveCache(this.cache);
          }
        }
        throw error;
      } finally {
        response?.destroy();
        if (allocation?.handle) await allocation.handle.close();
        if (allocation && !complete) {
          await this.storage.remove(allocation.name);
          await this.storage.remove(allocation.finalName);
        }
      }
    }, this.downloadTimeout);
  }
  async cancelUpdate() {
    if (this.active?.kind === 'download') {
      this.active.controller.abort(failure('cancelled'));
      await this.active.promise;
    }
    return this.getState();
  }
  discardUpdate() {
    return this.run('discard', async () => {
      if (!this.downloadedName || this.installation.isRunning()) return;
      const name = this.downloadedName;
      // Persist the tombstone before unlinking, so an interrupted discard cannot restore it.
      const cache = { ...this.cache, downloaded: null };
      await this.storage.saveCache(cache);
      this.cache = cache;
      this.downloadedName = null;
      this.candidate = null;
      await this.installation.setCandidate(null);
      this.publish({ downloadedVersion: null });
      this.applySelection(selectRelease(cache.releases || [], this.snapshot.currentVersion));
      await this.storage.remove(name);
    }, this.checkTimeout);
  }
  prepareUpdateInstall() {
    return this.run('prepare-install', () => this.installation.prepare(), this.checkTimeout);
  }
  confirmUpdateInstall() {
    // User-owned host exit has no network deadline; the independent adapter owns its lifetime.
    return this.run('confirm-install', () => this.installation.confirm(), null);
  }
  async cancelUpdateInstall() {
    await this.ready;
    await this.installation.cancel();
    return this.getState();
  }
  start() {
    if (this.disposed || this.autoTimer) return;
    const tick = async () => {
      await this.checkForUpdates({ automatic: true });
      if (this.disposed) return;
      const delay = this.snapshot.retryAt ? Math.max(60000, this.snapshot.retryAt - this.now())
        : Math.max(60000, (this.snapshot.checkedAt || this.now()) + DAY - this.now());
      this.autoTimer = setTimeout(tick, delay);
      this.autoTimer.unref?.();
    };
    this.autoTimer = setTimeout(tick, 30000);
    this.autoTimer.unref?.();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.autoTimer);
    this.listeners.clear();
    this.installation.dispose();
    clearTimeout(this.active?.timer);
    this.active?.controller.abort(failure('cancelled'));
    // The independent executor may be waiting for this very host to exit.
    // Await transfer cleanup, but never keep the host alive waiting for installation.
    if (this.active?.kind === 'confirm-install') return Promise.resolve();
    return this.active?.promise || this.ready;
  }
}
function createHostUpdateService({ app, appRoot, host }) {
  const { createWorkflowInstaller } = require('./install/WorkflowInstaller');
  const cacheRoot = path.join(app.getPath('userData'), 'workflow-updates');
  return new UpdateService({ appRoot, cacheRoot,
    installer: createWorkflowInstaller({ appRoot, cacheRoot, host }) });
}
module.exports = { UpdateService, createHostUpdateService, publicError };
