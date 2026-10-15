const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { ConfigStorage } = require("../config/ConfigStorage");

class ResolveInstallationError extends Error {
  constructor(code, stage, details = {}) {
    super(`Resolve installation discovery failed: ${code}`);
    this.code = code;
    this.details = { stage, ...details };
  }
}

// A read-only, bounded process-image query; an inaccessible image is never
// treated as evidence that a different installation is the current host.
function queryLiveResolveImages({ environment = process.env, execute = execFile } = {}) {
  const systemRoot = environment.SystemRoot || environment.SYSTEMROOT || environment.WINDIR;
  if (!systemRoot) return Promise.reject(new ResolveInstallationError("RESOLVE_IDENTITY_DENIED", "host-query"));
  const script = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $items=@(Get-Process -Name Resolve -ErrorAction SilentlyContinue); $records=@($items | ForEach-Object { try { $p=$_.Path; if(-not $p){throw 'unreadable'}; @{path=$p;pid=$_.Id} } catch { @{path=$null;pid=$_.Id} } }); @{records=$records;count=$items.Count} | ConvertTo-Json -Compress -Depth 3";
  return new Promise((resolve, reject) => execute(
    path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, shell: false, timeout: 5000, maxBuffer: 64 * 1024, encoding: "utf8" },
    (error, stdout) => {
      try {
        if (error) throw error;
        const value = JSON.parse(stdout);
        if (!Array.isArray(value.records) || value.records.length !== value.count
          || value.records.length > 64 || value.records.some((item) => typeof item?.path !== "string" || !item.path
            || !Number.isInteger(item.pid) || item.pid <= 0)) throw new Error("unreadable images");
        resolve(value.records.map(({ path: imagePath, pid }) => ({ path: imagePath, pid })));
      } catch (_error) { reject(new ResolveInstallationError("RESOLVE_IDENTITY_DENIED", "host-query")); }
    }
  ));
}

class RuntimeDiagnosticRecord {
  constructor({ filePath, storage, now = () => new Date().toISOString() } = {}) {
    this.storage = storage || (filePath ? new ConfigStorage(filePath) : null);
    this.now = now;
  }
  record({ status, code, stage, ...paths }) {
    const value = { schemaVersion: 1, status, code, stage, time: this.now() };
    for (const field of ["source", "resolveExecutable", "resolveRoot", "modulePath", "libraryPath"]) {
      if (typeof paths[field] === "string") value[field] = paths[field].slice(0, 4096);
    }
    try { this.storage?.save(value); } catch (_error) { /* Subordinate to discovery/readiness. */ }
    return value;
  }
}

class ResolveInstallationPaths {
  constructor({ host, appDataPath, storage, diagnosticRecord, environment = process.env,
    fileSystem = fs, pathApi = path, queryImages = () => queryLiveResolveImages({ environment }),
    isProcessAlive = (pid) => {
      try { process.kill(pid, 0); return true; }
      catch (error) { if (error.code === "ESRCH") return false; throw error; }
    }, now = () => new Date().toISOString() } = {}) {
    this.host = host;
    this.environment = environment;
    this.fs = fileSystem;
    this.path = pathApi;
    this.queryImages = queryImages;
    this.isProcessAlive = isProcessAlive;
    this.processIds = [];
    this.generation = 0;
    this.now = now;
    this.storage = storage || (appDataPath ? new ConfigStorage(path.join(appDataPath, "Clackly", "resolve-installation.json")) : null);
    this.diagnostics = diagnosticRecord || new RuntimeDiagnosticRecord();
    this.pending = null;
    this.snapshot = null;
  }

  file(candidate, code, stage) {
    try {
      if (typeof candidate !== "string" || !this.path.isAbsolute(candidate)) throw new Error("absolute file required");
      const canonical = this.fs.realpathSync(candidate);
      const stat = this.fs.statSync(canonical);
      if (!this.path.isAbsolute(canonical) || !stat.isFile() || !Number.isFinite(stat.size) || !Number.isFinite(stat.mtimeMs)) throw new Error("invalid file");
      return { path: canonical, size: stat.size, mtimeMs: stat.mtimeMs };
    } catch (error) {
      throw new ResolveInstallationError(error?.code === "EACCES" || error?.code === "EPERM" ? "RESOLVE_PATH_DENIED" : code, stage, { path: candidate });
    }
  }

  async identity() {
    const p = this.path;
    if (this.host?.kind === "workflow") {
      const electron = this.file(this.host.execPath, "RESOLVE_IDENTITY_INVALID", "host-identity");
      if (p.basename(electron.path).toLowerCase() !== "electron.exe"
        || p.basename(p.dirname(electron.path)).toLowerCase() !== "electron") {
        throw new ResolveInstallationError("RESOLVE_IDENTITY_INVALID", "host-identity");
      }
      const root = p.dirname(p.dirname(electron.path));
      const resolve = this.file(p.join(root, "Resolve.exe"), "RESOLVE_EXECUTABLE_NOT_FOUND", "host-identity");
      if (p.dirname(resolve.path).toLowerCase() !== root.toLowerCase()) {
        throw new ResolveInstallationError("RESOLVE_IDENTITY_INVALID", "host-identity");
      }
      return { executable: resolve, processIds: [] };
    }
    if (this.host?.kind !== "standalone") throw new ResolveInstallationError("RESOLVE_IDENTITY_INVALID", "host-identity");
    const images = await this.queryImages();
    if (!Array.isArray(images) || images.length > 64 || images.some((item) => typeof item?.path !== "string" || !item.path
      || !Number.isInteger(item.pid) || item.pid <= 0)) {
      throw new ResolveInstallationError("RESOLVE_IDENTITY_DENIED", "host-query");
    }
    const distinct = new Map();
    for (const image of images) {
      const file = this.file(image.path, "RESOLVE_IDENTITY_INVALID", "host-identity");
      if (p.basename(file.path).toLowerCase() !== "resolve.exe") throw new ResolveInstallationError("RESOLVE_IDENTITY_INVALID", "host-identity");
      distinct.set(file.path.toLowerCase(), file);
    }
    if (distinct.size !== 1) throw new ResolveInstallationError(
      distinct.size ? "RESOLVE_IDENTITY_AMBIGUOUS" : "RESOLVE_NOT_RUNNING", "host-identity", { count: distinct.size });
    return { executable: [...distinct.values()][0], processIds: [...new Set(images.map((image) => image.pid))] };
  }

  derive(identity) {
    const p = this.path;
    const resolveRoot = p.dirname(identity.path);
    const scriptingRoot = p.join(this.environment.PROGRAMDATA || "C:\\ProgramData",
      "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Scripting");
    const paths = { source: this.host.kind, resolveExecutable: identity.path, resolveRoot,
      modulePath: p.join(scriptingRoot, "Modules", "DaVinciResolveScript.py"),
      libraryPath: p.join(resolveRoot, "fusionscript.dll"), scriptingRoot,
      resolvePythonExecutable: p.join(resolveRoot, "ResolvePython", "ResolvePython.exe") };
    const files = { resolveExecutable: identity };
    for (const [field, code, stage] of [["modulePath", "RESOLVE_MODULE_NOT_FOUND", "module-path"],
      ["libraryPath", "RESOLVE_LIBRARY_NOT_FOUND", "library-path"]]) {
      try { files[field] = this.file(paths[field], code, stage); }
      catch (error) { error.details = { ...paths, ...error.details }; throw error; }
      paths[field] = files[field].path;
    }
    // ResolvePython is qualified only for Ordinary Scripts, never AE readiness.
    try { files.resolvePythonExecutable = this.file(paths.resolvePythonExecutable, "RESOLVE_PYTHON_NOT_FOUND", "ordinary-runtime"); }
    catch (_error) { files.resolvePythonExecutable = null; }
    paths.resolvePythonExecutable = files.resolvePythonExecutable?.path || null;
    paths.scriptingRoot = p.dirname(p.dirname(paths.modulePath));
    return { schemaVersion: 1, ...paths, files };
  }

  unchanged(snapshot) {
    try {
      for (const [field, metadata] of Object.entries(snapshot.files)) {
        const candidate = metadata?.path || this.path.join(snapshot.resolveRoot, "ResolvePython", "ResolvePython.exe");
        let current;
        try { current = this.file(candidate, "RESOLVE_PATH_CHANGED", "metadata"); }
        catch (error) { if (!metadata && field === "resolvePythonExecutable") continue; throw error; }
        if (!metadata || JSON.stringify(current) !== JSON.stringify(metadata)) return false;
      }
      return true;
    } catch (_error) { return false; }
  }

  invalidate() { this.generation += 1; this.snapshot = null; this.pending = null; this.processIds = []; }

  async discover(generation) {
    try {
      const identity = await this.identity();
      if (generation !== this.generation) return this.getSnapshot();
      const candidate = this.derive(identity.executable);
      let saved = null;
      let cacheCode;
      try { saved = this.storage?.load(); } catch (_error) { cacheCode = "CACHE_READ_FAILED"; }
      const match = saved?.schemaVersion === 1 && typeof saved.discoveredAt === "string"
        && Object.keys(candidate).every((field) => JSON.stringify(saved[field]) === JSON.stringify(candidate[field]));
      if (!match && !cacheCode && saved && Object.keys(saved).length) {
        cacheCode = saved.schemaVersion === 1 && saved.files ? "CACHE_PATHS_STALE" : "CACHE_SCHEMA_INVALID";
      }
      const snapshot = { ...candidate, discoveredAt: match ? saved.discoveredAt : this.now(),
        cache: { status: match ? "hit" : "miss", ...(cacheCode ? { code: cacheCode } : {}) } };
      if (!match && this.storage) {
        const { cache, ...record } = snapshot;
        try { this.storage.save(record); } catch (_error) { snapshot.cache = { status: "write-failed", code: "CACHE_WRITE_FAILED" }; }
      }
      this.diagnostics.record({ ...snapshot, status: "discovered", code: snapshot.cache.code || "RESOLVE_PATHS_DISCOVERED", stage: "installation-paths" });
      this.snapshot = snapshot;
      this.processIds = identity.processIds;
      return snapshot;
    } catch (error) {
      if (generation !== this.generation) return this.getSnapshot();
      const typed = error instanceof ResolveInstallationError ? error : new ResolveInstallationError("RESOLVE_IDENTITY_DENIED", "host-query");
      this.diagnostics.record({ ...typed.details, source: this.host?.kind, status: "failed", code: typed.code, stage: typed.details.stage });
      throw typed;
    }
  }

  async getSnapshot() {
    if (this.snapshot && this.host?.kind === "standalone") {
      try {
        // Signal 0 checks a bound PID without spawning or enumerating processes.
        // Only an exit triggers the bounded image query again. PIDs are never saved.
        const alive = this.processIds.map((pid) => this.isProcessAlive(pid));
        if (alive.some((value) => typeof value !== "boolean")) throw new Error("Unknown process liveness");
        if (alive.some((value) => !value)) this.invalidate();
      } catch (_error) {
        this.invalidate();
        const error = new ResolveInstallationError("RESOLVE_IDENTITY_DENIED", "host-liveness");
        this.diagnostics.record({ source: this.host.kind, status: "failed", code: error.code, stage: error.details.stage });
        throw error;
      }
    }
    if (this.snapshot && this.unchanged(this.snapshot)) return structuredClone(this.snapshot);
    if (!this.pending || this.snapshot) {
      this.snapshot = null;
      const pending = this.discover(this.generation);
      this.pending = pending;
      // Failures are diagnostic-only. A later explicit use can rediscover a
      // repaired installation; concurrent callers still share this attempt.
      pending.catch(() => { if (this.pending === pending) this.pending = null; });
    }
    return structuredClone(await this.pending);
  }
}

module.exports = { ResolveInstallationPaths, ResolveInstallationError, RuntimeDiagnosticRecord, queryLiveResolveImages };
