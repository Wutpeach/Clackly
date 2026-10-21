const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { assetUrl, installedVersion, stableVersion } = require('../identity');
const { readPointer, projectOutcome } = require('./outcome');
const SCRIPT_NAMES = ['executor.ps1', 'launch.ps1', 'recover.ps1', 'WorkflowTransaction.psm1', 'ExecutorSupport.psm1','LocalNative.psm1'];
const REASONS = new Set(['publisher-unverified', 'host-unqualified', 'target-unverified', 'permission-denied',
  'permission-cancelled', 'process-unknown', 'host-running', 'concurrent-install', 'recovery-required',
  'native-missing', 'native-invalid', 'native-incompatible', 'invalid-package', 'install-failed', 'unsupported-host']);

function normalPath(file, { missing = false } = {}) {
  if (typeof file !== 'string' || path.resolve(file) !== file || file.startsWith('\\\\') || file.slice(2).includes(':')) throw new Error('target-unverified');
  let cursor = path.parse(file).root;
  for (const part of file.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) { if (missing && error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) throw new Error('target-unverified');
  }
}
async function fileHash(file) {
  normalPath(file);
  const digest = crypto.createHash('sha256');
  for await (const bytes of fs.createReadStream(file)) digest.update(bytes);
  return digest.digest('hex');
}
function writeExclusive(file, value) {
  normalPath(file, { missing: true });
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function readJson(file) {
  normalPath(file);
  if (fs.statSync(file).size > 65536) throw new Error('recovery-required');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function publicReason(error) {
  if (['EACCES', 'EPERM', 'EROFS'].includes(error?.code)) return 'permission-denied';
  return REASONS.has(error?.message) ? error.message : 'install-failed';
}
function createWorkflowInstaller({ appRoot, cacheRoot, host } = {}) {
  let active = null;
  function locations() {
    if (process.platform !== 'win32') throw new Error('unsupported-host');
    if (!process.env.ProgramData || !process.env.LOCALAPPDATA) throw new Error('target-unverified');
    const scan = path.join(process.env.ProgramData, 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Workflow Integration Plugins');
    const target = path.join(scan, 'com.wutpeach.clackly');
    if (typeof appRoot !== 'string' || appRoot.toLowerCase() !== target.toLowerCase()) throw new Error('target-unverified');
    normalPath(appRoot);
    if (!installedVersion(appRoot)) throw new Error('target-unverified');
    const scripts = path.join(appRoot, 'scripts', 'workflow-update');
    for (const name of SCRIPT_NAMES) normalPath(path.join(scripts, name));
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    normalPath(powershell);
    return { scripts, powershell, inbox: path.join(process.env.LOCALAPPDATA, 'Clackly', 'Workflow Update Requests') };
  }
  async function qualifyCandidate(candidate) {
    if (process.platform !== 'win32') throw new Error('unsupported-host');
    if (!candidate || !stableVersion(candidate.version) || !/^[a-f0-9]{32}\.zip$/.test(candidate.name) ||
        !/^[a-f0-9]{64}$/.test(candidate.digest) || !Number.isSafeInteger(candidate.size) || candidate.size <= 0 ||
        candidate.size > 1073741824 || candidate.file !== path.join(cacheRoot, candidate.name) ||
        candidate.release?.version !== candidate.version || candidate.release?.digest !== candidate.digest ||
        candidate.release?.size !== candidate.size || !Number.isSafeInteger(candidate.release?.releaseId) || candidate.release.releaseId <= 0 ||
        !Number.isSafeInteger(candidate.release?.assetId) || candidate.release.assetId <= 0) throw new Error('invalid-package');
    try { assetUrl(candidate.release.url, candidate.version, `Clackly-Workflow-${candidate.version}-win-x64.zip`); }
    catch { throw new Error('invalid-package'); }
    normalPath(cacheRoot); normalPath(candidate.file);
    if (!fs.statSync(candidate.file).isFile() || fs.statSync(candidate.file).size !== candidate.size ||
        await fileHash(candidate.file) !== candidate.digest) throw new Error('invalid-package');
    const result = locations();
    if (host?.kind !== 'workflow' || typeof host.execPath !== 'string' || path.basename(host.execPath).toLowerCase() !== 'electron.exe' ||
        path.basename(path.dirname(host.execPath)).toLowerCase() !== 'electron') throw new Error('host-unqualified');
    normalPath(host.execPath);
    return result;
  }
  async function inspect(pointer, known = locations()) {
    const root = path.join(known.inbox, pointer.id);
    const request = readJson(path.join(root, 'request.json'));
    for (const key of ['id', 'version', 'digest', 'size']) if (request[key] !== pointer[key]) throw new Error('recovery-required');
    const child = spawn(known.powershell, ['-NoProfile', '-NonInteractive', '-File', path.join(known.scripts, 'executor.ps1'),
      '-RequestId', pointer.id, '-Operation', 'Inspect'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; let oversized = false;
    child.stdout.on('data', (bytes) => { if (Buffer.byteLength(output) + bytes.length > 65536) oversized = true; else output += bytes.toString('utf8'); });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('recovery-required')), 30000); timer.unref();
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (value) => { clearTimeout(timer); resolve(value); });
    });
    if (code !== 0 || oversized) throw new Error('recovery-required');
    return projectOutcome(JSON.parse(output.trim()), pointer.id);
  }
  async function readState() {
    try {
      const pointer = readPointer(cacheRoot, normalPath);
      return pointer ? await inspect(pointer) : null;
    } catch { return { status: 'failed', reason: 'recovery-required' }; }
  }
  async function qualify(candidate) {
    try { await qualifyCandidate(candidate); return { ready: true, reason: null }; }
    catch (error) { return { ready: false, reason: publicReason(error) }; }
  }
  function installing(operation) {
    const file = operation.root && path.join(operation.root, 'installing.json');
    if (file && fs.existsSync(file)) {
      const value = readJson(file);
      if (value.id !== operation.id || value.status !== 'installing') throw new Error('recovery-required');
      operation.installing = true;
    }
    return operation.installing;
  }
  async function run(candidate, operation, { onState = () => {}, signal } = {}) {
    try {
      const known = await qualifyCandidate(candidate);
      const previous = await readState();
      if (previous?.reason === 'recovery-required') throw new Error('recovery-required');
      if (signal?.aborted || operation.cancelRequested) return { status: 'cancelled', reason: null };
      operation.id = crypto.randomBytes(16).toString('hex');
      normalPath(known.inbox, { missing: true }); fs.mkdirSync(known.inbox, { recursive: true });
      operation.root = path.join(known.inbox, operation.id);
      fs.mkdirSync(operation.root);
      fs.copyFileSync(candidate.file, path.join(operation.root, 'candidate.zip'), fs.constants.COPYFILE_EXCL);
      const pointer = { schemaVersion: 1, id: operation.id, version: candidate.version, digest: candidate.digest, size: candidate.size };
      writeExclusive(path.join(operation.root, 'request.json'), { ...pointer, releaseId: candidate.release.releaseId,
        assetId: candidate.release.assetId, workflowExecutable: host.execPath });
      const pointerPath = path.join(cacheRoot, 'installation.json');
      writeExclusive(pointerPath + '.next', pointer); normalPath(pointerPath, { missing: true }); fs.renameSync(pointerPath + '.next', pointerPath);
      if (signal?.aborted || operation.cancelRequested) writeExclusive(path.join(operation.root, 'cancel.request'), { id: operation.id });
      const child = spawn(known.powershell, ['-NoProfile', '-NonInteractive', '-File', path.join(known.scripts, 'launch.ps1'),
        '-RequestId', operation.id], { windowsHide: true, stdio: 'ignore', detached: true });
      let exited = false; let launchError = null;
      child.once('error', (error) => { launchError = error; exited = true; });
      child.once('exit', () => { exited = true; });
      child.unref(); operation.launched = true;
      onState({ status: 'waiting-for-exit', reason: null });
      const deadline = Date.now() + 30 * 60 * 1000;
      while (Date.now() < deadline) {
        if (launchError) throw launchError;
        if (installing(operation) && !operation.notified) { operation.notified = true; onState({ status: 'installing', reason: null }); }
        // Actual launcher exit (including its waited worker) is required before
        // interpreting any terminal marker, then Inspect verifies actual trees.
        if (exited) return await inspect(pointer, known);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return { status: 'failed', reason: 'recovery-required' };
    } catch (error) { return { status: 'failed', reason: publicReason(error) }; }
  }
  async function start(candidate, options = {}) {
    if (active) return { status: 'failed', reason: 'concurrent-install' };
    if (options.signal?.aborted) return { status: 'cancelled', reason: null };
    const operation = {}; active = operation;
    operation.done = run(candidate, operation, options);
    try { return await operation.done; } finally { if (active === operation) active = null; }
  }
  async function cancel() {
    const operation = active;
    if (!operation) return { status: 'cancelled', reason: null };
    try {
      if (installing(operation)) return { status: 'installing', reason: null };
      operation.cancelRequested = true;
      if (operation.root) {
        const marker = path.join(operation.root, 'cancel.request');
        if (!fs.existsSync(marker)) writeExclusive(marker, { id: operation.id });
      }
      // Continue monitoring until real acknowledgement or cutoff. Never turn
      // the writable intent marker into a successful cancellation response.
      let complete = false; let outcome;
      operation.done.then((value) => { complete = true; outcome = value; });
      while (!complete) {
        if (installing(operation)) return { status: 'installing', reason: null };
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return outcome;
    } catch (error) { return { status: 'failed', reason: publicReason(error) }; }
  }
  return { qualify, start, cancel, readState };
}
module.exports = { createWorkflowInstaller };
