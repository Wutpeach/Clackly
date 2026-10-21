const RELEASE_MANIFEST = 'clackly-release.json';
const PLUGIN_ID = 'com.wutpeach.clackly';
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const SHA256 = /^[a-f0-9]{64}$/;
const path = require('node:path');
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const NATIVE_POLICY = Object.freeze({ path: 'workflow-plugin/WorkflowIntegration.node', provisioning: 'local-resolve',
  source: 'programdata-sampleplugin', platform: 'win32', arch: 'x64' });
function validateReleasePath(name) {
  if (typeof name !== 'string' || !name || name.length > 233 || name.includes('\\') || name.includes(':')
    || /[\x00-\x1f\x7f]/.test(name) || name.split('/').some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe release inventory path');
}
function validateInventory(files) {
  if (!Array.isArray(files) || !files.length || files.length > 20000) throw new Error('Invalid release inventory');
  let previous = '';
  const lower = new Set();
  for (const item of files) {
    validateReleasePath(item.path);
    if (item.path === RELEASE_MANIFEST || /(?:^|\/)WorkflowIntegration\.node(?:\/|$)/i.test(item.path) || ordinal(previous, item.path) >= 0
      || lower.has(item.path.toLowerCase()) || !SHA256.test(item.sha256)
      || !Number.isSafeInteger(item.size) || item.size < 0) throw new Error('Invalid, unsorted or colliding release inventory');
    previous = item.path; lower.add(item.path.toLowerCase());
  }
}

function validateManifest(manifest, version) {
  if (manifest.schemaVersion !== 2 || manifest.package?.name !== 'clackly'
    || manifest.package.id !== PLUGIN_ID || manifest.package.version !== version || !VERSION.test(version)
    || manifest.package.platform !== 'win32' || manifest.package.arch !== 'x64'
    || manifest.package.entrypoint !== 'workflow-plugin/main.js'
    || manifest.source?.repository !== 'Wutpeach/Clackly' || manifest.source.tag !== `v${version}`
    || manifest.source.workflowPath !== '.github/workflows/workflow-release.yml'
    || !/^[a-f0-9]{40}$/.test(manifest.source.commit) || typeof manifest.source.dirty !== 'boolean'
    || typeof manifest.build?.publishable !== 'boolean'
    || manifest.build.publishable && manifest.source.dirty) throw new Error('Release manifest identity is invalid');
  validateInventory(manifest.files);
  const files = new Map(manifest.files.map((item) => [item.path, item]));
  const requireFile = (name, hash, size) => {
    const item = files.get(name);
    if (!item || item.size < 1 || hash && item.sha256 !== hash || size && item.size !== size) throw new Error(`Incomplete release: ${name}`);
  };
  for (const name of ['package.json', 'manifest.xml', 'workflow-plugin/main.js', 'dist/renderer/index.html',
    'electron/main/update/UpdateService.js', 'scripts/workflow-update/WorkflowTransaction.psm1',
    'scripts/workflow-update/executor.ps1', 'scripts/workflow-update/launch.ps1', 'scripts/workflow-update/recover.ps1']) requireFile(name);
  if (manifest.runtime?.manifestPath !== 'resources/runtimes/manifest.json' || !SHA256.test(manifest.runtime.manifestSha256)
    || !Array.isArray(manifest.runtime.profiles) || !manifest.runtime.profiles.length) throw new Error('Runtime provenance missing');
  requireFile(manifest.runtime.manifestPath, manifest.runtime.manifestSha256);
  for (const profile of manifest.runtime.profiles) {
    if (!profile.id || !VERSION.test(profile.version) || !SHA256.test(profile.lockSha256)) throw new Error('Runtime profile provenance invalid');
    requireFile(profile.lockPath, profile.lockSha256);
  }
  const native = manifest.native;
  if (!native || Object.keys(native).length !== Object.keys(NATIVE_POLICY).length
    || Object.entries(NATIVE_POLICY).some(([key, value]) => native[key] !== value)) throw new Error('Native provisioning policy invalid');
  return manifest;
}

function validateRuntime(manifest, json) {
  const runtime = json('resources/runtimes/manifest.json');
  if (runtime.schemaVersion !== 1 || !Array.isArray(runtime.profiles)) throw new Error('Runtime manifest invalid');
  if (runtime.profiles.length !== manifest.runtime.profiles.length) throw new Error('Runtime profile inventory mismatch');
  for (const profile of runtime.profiles) {
    const recorded = manifest.runtime.profiles.find((item) => item.id === profile.id);
    if (!recorded || recorded.version !== profile.runtimeVersion || profile.platform !== 'win32' || profile.architecture !== 'x64') throw new Error('Runtime profile mismatch');
    if (typeof profile.executable !== 'string' || !manifest.files.some((item) =>
      item.path === `resources/runtimes/${profile.executable}` && item.size > 0)) throw new Error('Runtime executable path invalid');
    const lock = json(recorded.lockPath);
    const base = path.posix.dirname(profile.executable);
    const stem = `python${profile.runtimeVersion.split('.').slice(0, 2).join('')}`;
    for (const name of ['python.exe', `${stem}.dll`, `${stem}.zip`, `${stem}._pth`, 'runtime.json',
      'LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'python-embed.sigstore', 'python-embed.spdx.json',
      'application.spdx.json', 'clackly/bootstrap.py', 'clackly/persistent_bootstrap.py', 'clackly/python_runner.py']) {
      if (!manifest.files.some((item) => item.path === `resources/runtimes/${base.replaceAll('\\', '/')}/${name}` && item.size > 0)) throw new Error(`Runtime incomplete: ${name}`);
    }
    const metadata = json('resources/runtimes/' + base + '/runtime.json');
    if (lock.profileId !== profile.id || lock.version !== profile.runtimeVersion || metadata.runtimeVersion !== lock.version
      || metadata.source.sha256 !== lock.asset.sha256 || metadata.build.lockSha256 !== recorded.lockSha256) throw new Error('Runtime lock/provenance mismatch');
    for (const source of metadata.build.applicationSources) {
      if (!manifest.files.some((item) => item.path === `resources/runtimes/${base.replaceAll('\\', '/')}/${source.path}` && item.sha256 === source.sha256)) throw new Error('Runtime application source differs from metadata');
    }
  }
  for (const item of manifest.files) {
    if (/^(?:electron\.exe|Clackly\.exe|payload\/|tools\/|resources\/app\/)/i.test(item.path)
      || /(?:^|\/)node_modules\/(?:electron|electron-builder|vite|playwright)\//.test(item.path)) throw new Error('Standalone/Beta/development payload is forbidden');
  }
  return manifest;
}

module.exports = { VERSION, RELEASE_MANIFEST, SHA256, NATIVE_POLICY, validateInventory, validateManifest, validateRuntime };
