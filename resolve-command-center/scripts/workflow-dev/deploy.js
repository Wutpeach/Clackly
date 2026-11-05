const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { listTree, assertNormalExistingDirectory } = require('../package-internal-beta');
const { validateManifest, validateRuntime, RELEASE_MANIFEST } = require('../../electron/main/update/release-manifest');
const { RuntimeLauncher } = require('../../script-runtime/runtime/launcher');

const APP = path.resolve(__dirname, '../..');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(String.fromCharCode(0xfeff), ''));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const inventory = (root) => {
  assertNormalExistingDirectory(root);
  return fs.existsSync(root) ? listTree(root) : null;
};
function same(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}
function owned(root, file) {
  if (!path.resolve(file).startsWith(path.resolve(root) + path.sep)) throw new Error('Path escapes deployment session');
  assertNormalExistingDirectory(path.dirname(file));
  return file;
}
function copyVerified(source, destination, expected = inventory(source)) {
  if (fs.existsSync(destination)) throw new Error('Backup/restore destination exists');
  assertNormalExistingDirectory(destination);
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  same(inventory(destination), expected, 'Full backup/restore verification failed');
  return expected;
}
function snapshotEntry(file) {
  assertNormalExistingDirectory(path.dirname(file));
  const stat = fs.lstatSync(file);
  if (stat.isDirectory() && !stat.isSymbolicLink()) return { files: inventory(file) };
  if (stat.isFile() && !stat.isSymbolicLink()) return { size: stat.size, sha256: hash(file) };
  throw new Error('Unsafe neighboring entry: ' + file);
}
function verifyInstalled(root, { commit, nativeHash, helperHash } = {}) {
  const files = inventory(root);
  const manifest = validateManifest(read(path.join(root, RELEASE_MANIFEST)), read(path.join(root, 'package.json')).version);
  validateRuntime(manifest, (name) => read(path.join(root, name)));
  if (commit && (manifest.source.commit !== commit || manifest.source.dirty || manifest.build.publishable)) {
    throw new Error('Development payload must identify the exact clean commit and be nonpublishable');
  }
  const actual = new Map(files.map((item) => [item.relativePath, item]));
  for (const file of manifest.files) {
    const entry = actual.get(file.path);
    if (!entry || entry.size !== file.size || entry.sha256.toLowerCase() !== file.sha256) throw new Error('Installed payload differs: ' + file.path);
  }
  const extras = new Set([RELEASE_MANIFEST, 'clackly-setup-check.ps1', 'unins000.exe', 'unins000.dat', 'workflow-plugin/WorkflowIntegration.node']);
  const declared = new Set(manifest.files.map((file) => file.path));
  for (const file of files) if (!declared.has(file.relativePath) && !extras.has(file.relativePath)) throw new Error('Unrecognized installed file: ' + file.relativePath);
  for (const name of extras) if (!actual.get(name)?.size) throw new Error('Installation metadata/native missing: ' + name);
  if (nativeHash && hash(path.join(root, 'workflow-plugin/WorkflowIntegration.node')) !== nativeHash) throw new Error('Native hash differs');
  if (helperHash && hash(path.join(root, 'clackly-setup-check.ps1')) !== helperHash) throw new Error('Uninstall helper differs');
  return manifest;
}
async function verifyRuntimes(root) {
  const profiles = read(path.join(root, 'resources/runtimes/manifest.json')).profiles;
  const results = [];
  for (const profile of profiles) {
    const executable = path.join(root, 'resources/runtimes', profile.executable);
    const bootstrapPath = path.join(path.dirname(executable), 'clackly/bootstrap.py');
    const { response } = await new RuntimeLauncher({ bootstrapPath }).execute({
      resolution: { executable, profile, source: 'manifest', supportStatus: 'machine-verified' },
      request: { operation: 'runtime-info' }
    });
    if (response.runtime.version !== profile.runtimeVersion || response.runtime.architecture !== '64bit'
      || fs.realpathSync(response.runtime.executable) !== fs.realpathSync(executable)) throw new Error('Managed Runtime identity differs');
    results.push({ id: profile.id, version: response.runtime.version, architecture: response.runtime.architecture });
  }
  return results;
}

// Direct fixture tests inject host/registry/installer boundaries; CLI targets remain fixed.
async function installWithBackup({ target, session, inspect, closed = inspect, exportRegistry, install, verify, restoreRegistry, preserved }) {
  inspect();
  const before = inventory(target);
  copyVerified(target, owned(session, path.join(session, 'previous')), before);
  exportRegistry();
  const registryHash = hash(path.join(session, 'uninstall.reg'));
  const permissions = path.join(session, 'permissions.acl');
  const permissionsHash = fs.existsSync(permissions) ? hash(permissions) : null;
  const journal = { status: 'prepared', before, registryHash, permissionsHash, preserved: preserved(), target };
  write(path.join(session, 'deployment.json'), journal);
  inspect();
  same(inventory(target), before, 'Installed tree changed before installation');
  same(preserved(), journal.preserved, 'User data or neighboring plugins changed before installation');
  journal.status = 'installing'; write(path.join(session, 'deployment.json'), journal);
  try {
    const exitCode = await install();
    if (exitCode !== 0) throw new Error('Inno exit code ' + exitCode);
    await verify();
    same(preserved(), journal.preserved, 'User data or neighboring plugins changed');
    journal.installed = inventory(target);
    journal.status = 'installed'; write(path.join(session, 'deployment.json'), journal);
    return journal;
  } catch (error) {
    journal.error = error.message; journal.status = 'failed'; write(path.join(session, 'deployment.json'), journal);
    try {
      rollback({ target, session, inspect: closed, restoreRegistry, journal });
    } catch (failure) {
      journal.status = 'recovery-required'; journal.rollbackError = failure.message;
      write(path.join(session, 'deployment.json'), journal);
    }
    throw new Error(error.message + '; deployment status: ' + journal.status + '; backup: ' + path.join(session, 'previous'));
  }
}
function rollback({ target, session, inspect, restoreRegistry, journal = read(path.join(session, 'deployment.json')) }) {
  inspect();
  if (path.resolve(journal.target) !== path.resolve(target)) throw new Error('Rollback target mismatch');
  same(inventory(path.join(session, 'previous')), journal.before, 'Backup changed; refusing rollback');
  if (hash(path.join(session, 'uninstall.reg')) !== journal.registryHash) throw new Error('Registry backup changed');
  if (journal.permissionsHash && hash(path.join(session, 'permissions.acl')) !== journal.permissionsHash) throw new Error('Permission backup changed');
  if (journal.status === 'installed') same(inventory(target), journal.installed, 'Current install changed; refusing rollback');
  if (journal.status === 'rolled-back') { same(inventory(target), journal.before, 'Restored tree changed'); return journal; }
  if (!['prepared', 'installed', 'failed', 'installing', 'recovery-required'].includes(journal.status)) throw new Error('Deployment not eligible for rollback');
  if (JSON.stringify(inventory(target)) !== JSON.stringify(journal.before)) {
    const restore = owned(session, path.join(session, 'restore'));
    copyVerified(path.join(session, 'previous'), restore, journal.before);
    // Keep both trees. Renames are confined to this session and its recorded exact target.
    if (fs.existsSync(target)) fs.renameSync(target, owned(session, path.join(session, 'replaced')));
    fs.renameSync(restore, target);
  }
  restoreRegistry();
  same(inventory(target), journal.before, 'Rollback tree differs');
  journal.status = 'rolled-back'; write(path.join(session, 'deployment.json'), journal);
  return journal;
}

function run(command, args, cwd, log, env = process.env) {
  const result = cp.spawnSync(command, args, { cwd, env, windowsHide: true, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  if (log) fs.writeFileSync(log, (result.stdout || '') + (result.stderr || ''));
  if (result.error || result.status !== 0) throw new Error('Command failed: ' + command + ' ' + args.join(' ') + (log ? '; log: ' + log : '\n' + result.stderr));
  return (result.stdout || '').trim();
}
function ps(args, cwd = APP, log) {
  // npm may inherit PS7's module path; Windows PowerShell must load its own modules.
  const env = { ...process.env, PSModulePath: path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/Modules') };
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], cwd, log, env);
}
function npm(args, cwd, log) {
  // npm-cli runs without cmd.exe string interpolation.
  const cli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  return run(process.execPath, [cli, ...args], cwd, log);
}
async function main(args = process.argv.slice(2)) {
  if (process.platform !== 'win32') throw new Error('Windows only');
  if (args.length && !(args.length === 2 && args[0] === '--rollback' && /^[a-f0-9]{32}$/.test(args[1]))) throw new Error('Usage: npm run workflow:deploy:dev [-- --rollback <session-id>]');
  const programData = ps(['-Command', "[Environment]::GetFolderPath('CommonApplicationData')"]);
  const target = path.join(programData, 'Blackmagic Design/DaVinci Resolve/Support/Workflow Integration Plugins/com.wutpeach.clackly');
  const sessions = path.join(programData, 'Clackly Dev Deploy');
  const platform = path.join(__dirname, 'platform.ps1');
  assertNormalExistingDirectory(sessions);
  ps(['-File', platform, '-Mode', 'InitRoot']);
  const lock = path.join(sessions, 'deployment.lock');
  const handle = fs.openSync(lock, 'wx');
  fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, created: new Date().toISOString() }));
  const id = args[1] || crypto.randomBytes(16).toString('hex');
  const session = owned(sessions, path.join(sessions, id));
  const call = (mode, ...extra) => ps(['-File', platform, '-Mode', mode, '-Id', id, ...extra]);
  const inspect = () => {
    call('Inspect'); inventory(target);
    const transactions = path.dirname(target) + '.Clackly Updates';
    if (fs.existsSync(transactions)) for (const file of fs.readdirSync(transactions).filter((name) => name.endsWith('.json'))) {
      if (!['installed','rolled-back'].includes(read(path.join(transactions, file)).state)) throw new Error('Workflow update needs recovery: ' + file);
    }
  };
  try {
    if (args.length) {
      rollback({ target, session, inspect: () => call('Closed'), restoreRegistry: () => call('RestoreRegistry') });
      console.log(JSON.stringify({ status: 'rolled-back', id, session, target }, null, 2)); return;
    }
    for (const name of fs.readdirSync(sessions).filter((name) => /^[a-f0-9]{32}$/.test(name))) {
      const journal = path.join(sessions, name, 'deployment.json');
      if (fs.existsSync(journal) && !['installed', 'rolled-back'].includes(read(journal).status)) throw new Error('Previous development deployment needs recovery: ' + name);
    }
    fs.mkdirSync(session);
    inspect(); verifyInstalled(target);
    const git = (...values) => run('git', values, APP);
    if (git('branch', '--show-current') !== 'main' || git('status', '--porcelain', '--untracked-files=normal')) throw new Error('Commit changes on main before development deployment');
    const commit = git('rev-parse', 'HEAD');
    const build = path.join(APP, 'build/workflow-dev', id);
    assertNormalExistingDirectory(build); fs.mkdirSync(build, { recursive: true });
    console.log('Build snapshot ' + commit + '; evidence ' + build);
    const source = path.join(build, 'source');
    git('worktree', 'add', '--detach', source, commit);
    const app = path.join(source, 'resolve-command-center');
    let completed = false;
    try {
      npm(['ci', '--no-audit', '--no-fund'], app, path.join(build, 'npm-ci.log'));
      ps(['-File', path.join(app, 'scripts/stage-managed-python.ps1'), '-CacheDirectory', path.join(APP, 'build/runtime-cache')], app, path.join(build, 'runtime-stage.log'));
      npm(['run', 'build'], app, path.join(build, 'renderer.log'));
      run(process.execPath, [path.join(app, 'node_modules/electron-builder/cli.js'), '--win', 'dir', '--config.electronDist=' + path.join(app, 'node_modules/electron/dist')], app, path.join(build, 'package.log'));
      run(process.execPath, [path.join(app, 'scripts/workflow-release/package.js'), '--nonpublishable', '--output', path.join(build, 'workflow')], app, path.join(build, 'workflow.log'));
      const version = read(path.join(app, 'package.json')).version;
      const zip = path.join(build, 'workflow', 'Clackly-Workflow-' + version + '-win-x64.zip');
      ps(['-File', path.join(app, 'scripts/inno-setup/Build.ps1'), '-Archive', zip, '-Output', path.join(build, 'setup')], app, path.join(build, 'setup.log'));
      const setup = path.join(build, 'setup', 'Clackly-Setup-' + version + '-win-x64.exe');
      const payload = path.join(build, 'setup/payload/plugin');
      const { validatePlugin } = require(path.join(app, 'scripts/workflow-release/package'));
      const manifest = validatePlugin(payload, version);
      if (manifest.source.commit !== commit || manifest.source.dirty || manifest.build.publishable) throw new Error('Build provenance differs');
      const runtime = await verifyRuntimes(payload);
      const native = JSON.parse(call('Native'));
      const nativeHash = native.sha256.toLowerCase();
      const helperHash = hash(path.join(app, 'scripts/inno-setup/Check-Install.ps1'));
      if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain', '--untracked-files=normal')
        || run('git', ['status', '--porcelain', '--untracked-files=normal'], app)) throw new Error('Source changed during build');
      const roaming = path.join(process.env.APPDATA, 'Clackly');
      const legacyRoaming = path.join(process.env.APPDATA, 'Clackly Workflow Plugin');
      const scan = path.dirname(target);
      const preserved = () => ({ data: inventory(roaming), legacyData: inventory(legacyRoaming),
        neighbors: fs.readdirSync(scan).filter((name) => name !== path.basename(target)).sort().map((name) => ({ name, ...snapshotEntry(path.join(scan, name)) })) });
      const setupHash = hash(setup);
      const report = { id, target, session, build, commit, branch: 'main', dirty: false, publishable: false, node: process.version,
        os: require('node:os').release(), lockSha256: hash(path.join(app, 'package-lock.json')), runtime, nativeHash,
        setup: { path: setup, size: fs.statSync(setup).size, sha256: setupHash },
        zip: { path: zip, size: fs.statSync(zip).size, sha256: hash(zip) } };
      write(path.join(session, 'build.json'), report); write(path.join(build, 'deployment-build.json'), report);
      if (fs.existsSync(roaming)) copyVerified(roaming, owned(session, path.join(session, 'appdata-backup')));
      await installWithBackup({ target, session, inspect, closed: () => call('Closed'), preserved, exportRegistry: () => call('ExportRegistry'),
        restoreRegistry: () => call('RestoreRegistry'), install: () => JSON.parse(call('Install', '-Setup', setup, '-Sha256', setupHash)).exitCode,
        verify: async () => {
          inspect(); verifyInstalled(target, { commit, nativeHash, helperHash });
          same(await verifyRuntimes(target), runtime, 'Installed Runtime identity differs');
          same(fs.readFileSync(path.join(target, RELEASE_MANIFEST)).toString(), fs.readFileSync(path.join(payload, RELEASE_MANIFEST)).toString(), 'Installed manifest differs from payload');
        } });
      report.status = 'installed'; write(path.join(session, 'build.json'), report); write(path.join(build, 'deployment-build.json'), report);
      completed = true; console.log(JSON.stringify(report, null, 2));
    } finally {
      // Remove only this clean, detached build worktree; retain all artifacts/logs.
      if (completed && !run('git', ['status', '--porcelain', '--untracked-files=normal'], app)) git('worktree', 'remove', '--force', source);
    }
  } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { inventory, snapshotEntry, copyVerified, verifyInstalled, verifyRuntimes, installWithBackup, rollback, owned };
