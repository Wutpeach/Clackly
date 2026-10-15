const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { failure } = require('./identity');

function contained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function normalDirectory(directory) {
  const existing = [];
  let current = path.resolve(directory);
  while (true) {
    try {
      const stat = await fs.lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('unsafe-path');
      existing.push(current);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // lstat covers symbolic links/junctions. Check Windows ReparsePoint attributes
  // as well, including non-symlink reparse types; inaccessible probes fail closed.
  await noReparse(existing);
}
async function noReparse(existing) {
  if (process.platform === 'win32') {
    const script = '$ErrorActionPreference = "Stop"; foreach ($p in ($env:CLACKLY_UPDATE_PATHS | ConvertFrom-Json)) { if ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 3 } }';
    try {
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000, maxBuffer: 65536,
        env: { ...process.env, CLACKLY_UPDATE_PATHS: JSON.stringify(existing) } });
    } catch { throw failure('unsafe-path'); }
  }
}
class UpdateStorage {
  constructor(root, appRoot) {
    this.root = path.resolve(root);
    this.appRoot = path.resolve(appRoot);
    this.ready = null;
    if (this.root === this.appRoot || contained(this.appRoot, this.root) || contained(this.root, this.appRoot)) throw failure('unsafe-path');
  }
  prepare() {
    if (!this.ready) this.ready = this.initialize().catch((error) => { this.ready = null; throw error; });
    return this.ready;
  }
  async initialize() {
    await normalDirectory(this.root);
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    await normalDirectory(this.root);
    for (const name of await fs.readdir(this.root)) {
      if (/^[a-f0-9]{32}\.part$/.test(name) || /^cache-[a-f0-9]{32}\.tmp$/.test(name)) await this.remove(name);
    }
  }
  file(name) {
    if (!/^(cache\.json|cache-[a-f0-9]{32}\.tmp|[a-f0-9]{32}\.(part|zip))$/.test(name)) throw failure('unsafe-path');
    return path.join(this.root, name);
  }
  async safeFile(name, { missing = false } = {}) {
    await normalDirectory(this.root);
    const file = this.file(name);
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw failure('unsafe-path');
      await noReparse([file]);
      return { file, stat };
    } catch (error) { if (missing && error.code === 'ENOENT') return { file, stat: null }; throw error; }
  }
  async remove(name) {
    const { file, stat } = await this.safeFile(name, { missing: true });
    if (stat) await fs.unlink(file);
  }
  async readCache() {
    await this.prepare();
    const { file, stat } = await this.safeFile('cache.json', { missing: true });
    if (!stat) return null;
    // At most two bounded discovery responses: current latest plus retained candidate identity.
    if (stat.size > 5 * 1024 * 1024) return null;
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
  }
  async cleanupDownloads(keep = null) {
    await this.prepare();
    await normalDirectory(this.root);
    for (const name of await fs.readdir(this.root)) {
      if (/^[a-f0-9]{32}\.zip$/.test(name) && name !== keep) await this.remove(name);
    }
  }
  async saveCache(cache) {
    await this.prepare();
    await this.safeFile('cache.json', { missing: true });
    const name = `cache-${crypto.randomBytes(16).toString('hex')}.tmp`;
    const file = this.file(name);
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(cache)); await handle.sync(); }
      finally { await handle.close(); }
      await this.safeFile('cache.json', { missing: true });
      await fs.rename(file, this.file('cache.json'));
    } finally { await this.remove(name); }
  }
  async allocate(size, space = fs.statfs) {
    await this.prepare();
    await normalDirectory(this.root);
    const stats = await space(this.root);
    if (Number(stats.bavail) * Number(stats.bsize) < size + 64 * 1024 * 1024) throw failure('disk-space');
    const token = crypto.randomBytes(16).toString('hex');
    const name = `${token}.part`;
    const handle = await fs.open(this.file(name), 'wx', 0o600);
    return { name, finalName: `${token}.zip`, handle };
  }
  async retain(name, finalName) {
    await this.safeFile(name);
    const { stat } = await this.safeFile(finalName, { missing: true });
    if (stat) throw failure('unsafe-path');
    await fs.rename(this.file(name), this.file(finalName));
  }
}
module.exports = { contained, normalDirectory, UpdateStorage };
