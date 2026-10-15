const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const { listTree, assertNormalExistingDirectory, readWorkflowManifest } = require('../package-internal-beta');
const { verifyPackage } = require('../verify-package');
const { entryPath, verifyZip } = require('../../electron/main/update/zip');
const { readQualification, verifyOfficialNative, SHA256 } = require('./qualification');

const APP_ROOT = path.resolve(__dirname, '../..');
const RELEASE_MANIFEST = 'clackly-release.json';
const PLUGIN_ID = 'com.wutpeach.clackly';
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const inventory = (root) => listTree(root, { exclude: new Set([RELEASE_MANIFEST]) })
  .map((item) => ({ path: item.relativePath, size: item.size, sha256: item.sha256.toLowerCase() }))
  .sort((a, b) => ordinal(a.path, b.path));

function git(args, appRoot = APP_ROOT) {
  return cp.execFileSync('git', args, { cwd: appRoot, encoding: 'utf8', windowsHide: true }).trim();
}
function sourceIdentity(version, { appRoot = APP_ROOT, publishable = true, tag = `v${version}` } = {}) {
  if (!VERSION.test(version) || tag !== `v${version}`) throw new Error('Tag must exactly match v<package.json version>');
  const commit = git(['rev-parse', 'HEAD'], appRoot);
  const dirty = Boolean(git(['status', '--porcelain', '--untracked-files=normal'], appRoot));
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Source commit is invalid');
  if (publishable && dirty) throw new Error('Publication requires a clean committed worktree');
  if (publishable && git(['rev-parse', `${tag}^{commit}`], appRoot) !== commit) throw new Error('Tag must point to the exact source commit');
  if (publishable && process.env.GITHUB_REF && process.env.GITHUB_REF !== `refs/tags/${tag}`) throw new Error('Release runner ref differs from source tag');
  return { repository: 'Wutpeach/Clackly', tag, commit, dirty,
    workflowPath: '.github/workflows/workflow-release.yml',
    runId: process.env.GITHUB_RUN_ID || null, runAttempt: process.env.GITHUB_RUN_ATTEMPT || null };
}

function validateInventory(files) {
  if (!Array.isArray(files) || !files.length || files.length > 20000) throw new Error('Invalid release inventory');
  let previous = '';
  const lower = new Set();
  for (const item of files) {
    entryPath({ fileName: `plugin/${item.path}`, compressionMethod: 0, externalFileAttributes: 0,
      generalPurposeBitFlag: 0, uncompressedSize: item.size });
    if (item.path === RELEASE_MANIFEST || ordinal(previous, item.path) >= 0
      || lower.has(item.path.toLowerCase()) || !SHA256.test(item.sha256)
      || !Number.isSafeInteger(item.size) || item.size < 0) throw new Error('Invalid, unsorted or colliding release inventory');
    previous = item.path; lower.add(item.path.toLowerCase());
  }
}

function validateManifest(manifest, version) {
  if (manifest.schemaVersion !== 1 || manifest.package?.name !== 'clackly'
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
  if (native?.path !== 'workflow-plugin/WorkflowIntegration.node' || !SHA256.test(native.sha256)
    || !Number.isSafeInteger(native.size) || native.source !== 'Blackmagic Design/Workflow Integration/Examples/SamplePlugin'
    || !['local-development', 'release-qualified'].includes(native.qualification)) throw new Error('Native provenance invalid');
  requireFile(native.path, native.sha256, native.size);
  if (manifest.build.publishable && (native.qualification !== 'release-qualified'
    || !SHA256.test(native.sourceArchiveSha256)
    || native.redistribution?.status !== 'approved' || !native.redistribution.evidenceRef)) throw new Error('Public release qualification missing');
  return manifest;
}

function validatePlugin(root, version) {
  assertNormalExistingDirectory(root);
  const manifest = validateManifest(readJson(path.join(root, RELEASE_MANIFEST)), version);
  if (JSON.stringify(inventory(root)) !== JSON.stringify(manifest.files)) throw new Error('Plugin inventory/hash differs from release manifest');
  const pkg = readJson(path.join(root, 'package.json'));
  const xml = readWorkflowManifest(path.join(root, 'manifest.xml'));
  if (pkg.name !== 'clackly' || pkg.version !== version || xml.version !== version
    || !/<FilePath>\s*workflow-plugin\/main\.js\s*<\/FilePath>/.test(fs.readFileSync(path.join(root, 'manifest.xml'), 'utf8'))) throw new Error('Plugin entry/version mismatch');
  validateRuntime(manifest, (name) => readJson(path.join(root, name)));
  verifyNativeHeader(fs.readFileSync(path.join(root, manifest.native.path)));
  return manifest;
}

function verifyNativeHeader(buffer) {
  const offset = buffer.length >= 64 ? buffer.readUInt32LE(60) : -1;
  if (buffer.toString('ascii', 0, 2) !== 'MZ' || offset < 64 || offset + 6 > buffer.length
    || buffer.toString('ascii', offset, offset + 4) !== 'PE\0\0' || buffer.readUInt16LE(offset + 4) !== 0x8664) throw new Error('Native module is not a Windows x64 PE');
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

function validateDependencies(plugin, lock) {
  for (const [name, metadata] of Object.entries(lock.packages)) {
    if (!name || metadata.dev || metadata.optional) continue;
    const installed = readJson(path.join(plugin, name, 'package.json'));
    if (installed.version !== metadata.version) throw new Error(`Production dependency version mismatch: ${name}`);
  }
}

function powershell(script) {
  cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString('base64')],
  { windowsHide: true, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 });
}
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

async function verifyArchive(file, version) {
  if (path.basename(file) !== `Clackly-Workflow-${version}-win-x64.zip`) throw new Error('ZIP filename/version mismatch');
  await verifyZip(file, version);
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      const files = []; let release; const contents = new Map(); let metadataSize = 0;
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) { zip.close(); reject(error); return; }
          const hash = crypto.createHash('sha256'); let size = 0; const chunks = [];
          const relative = entry.fileName.slice(7);
          const capture = relative === RELEASE_MANIFEST || relative === 'workflow-plugin/WorkflowIntegration.node'
            || relative === 'package.json' || relative === 'manifest.xml'
            || relative.startsWith('resources/runtimes/') && relative.endsWith('.json');
          stream.on('error', (error) => { zip.close(); reject(error); });
          stream.on('data', (chunk) => {
            size += chunk.length; hash.update(chunk);
            if (capture) {
              if (size > 16 * 1024 * 1024) { stream.destroy(new Error('Oversized release manifest')); return; }
              metadataSize += chunk.length;
              if (metadataSize > 64 * 1024 * 1024) { stream.destroy(new Error('Oversized package metadata')); return; }
              chunks.push(chunk);
            }
          });
          stream.on('end', () => {
            if (capture) contents.set(relative, Buffer.concat(chunks));
            if (entry.fileName === `plugin/${RELEASE_MANIFEST}`) release = Buffer.concat(chunks);
            else files.push({ path: entry.fileName.slice(7), size, sha256: hash.digest('hex') });
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        try {
          const manifest = validateManifest(JSON.parse(release.toString('utf8')), version);
          files.sort((a, b) => ordinal(a.path, b.path));
          if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('ZIP full inventory/hash mismatch');
          validateRuntime(manifest, (name) => JSON.parse(contents.get(name).toString('utf8')));
          verifyNativeHeader(contents.get(manifest.native.path));
          resolve({ manifest, sha256: digest(fs.readFileSync(file)), size: fs.statSync(file).size });
        } catch (error) { reject(error); }
      });
      zip.readEntry();
    });
  });
}

async function buildWorkflow({ appRoot = APP_ROOT, packageRoot = path.join(appRoot, 'release/win-unpacked'),
  sourceRoot, outputRoot = path.join(appRoot, 'release/workflow'), qualificationFile, publishable = true, tag } = {}) {
  const q = readQualification(qualificationFile, { publishable });
  if (!sourceRoot) throw new Error('Official SDK required: supply --source-root <owner-provisioned Workflow Integrations directory>; no SDK lookup or download fallback');
  const nativeFile = verifyOfficialNative(sourceRoot, q);
  const pkg = readJson(path.join(appRoot, 'package.json'));
  const source = sourceIdentity(pkg.version, { appRoot, publishable, tag });
  const xml = readWorkflowManifest(path.join(appRoot, 'manifest.xml'));
  if (xml.version !== pkg.version) throw new Error('Repository manifest/package version mismatch');
  listTree(packageRoot);
  await verifyPackage({ appRoot, packageRoot });
  assertNormalExistingDirectory(outputRoot);
  fs.mkdirSync(outputRoot, { recursive: true });
  const name = `Clackly-Workflow-${pkg.version}-win-x64`;
  const zipPath = path.join(outputRoot, `${name}.zip`);
  if (fs.existsSync(zipPath)) throw new Error('Output ZIP exists; choose a new --output directory to preserve prior evidence');
  const temporary = fs.mkdtempSync(path.join(outputRoot, '.build-'));
  const plugin = path.join(temporary, 'plugin');
  try {
    fs.cpSync(path.join(packageRoot, 'resources/app'), plugin, { recursive: true, dereference: false, errorOnExist: true });
    const runtimes = path.join(plugin, 'resources/runtimes');
    if (fs.existsSync(runtimes)) throw new Error('App must not contain a second embedded Runtime tree');
    fs.cpSync(path.join(packageRoot, 'resources/runtimes'), runtimes, { recursive: true, dereference: false, errorOnExist: true });
    // Overlay only this owned staging tree. Never change the old source/native pin or installed plugin.
    fs.copyFileSync(nativeFile, path.join(plugin, 'workflow-plugin/WorkflowIntegration.node'));
    validateDependencies(plugin, readJson(path.join(appRoot, 'package-lock.json')));
    for (const file of ['dist/renderer/index.html', 'workflow-plugin/main.js',
      'scripts/workflow-update/WorkflowTransaction.psm1', 'scripts/workflow-update/executor.ps1',
      'scripts/workflow-update/launch.ps1', 'scripts/workflow-update/recover.ps1']) {
      if (digest(fs.readFileSync(path.join(appRoot, file))) !== digest(fs.readFileSync(path.join(plugin, file)))) throw new Error(`Packaged source is stale: ${file}`);
    }
    const files = inventory(plugin);
    const runtimeManifest = readJson(path.join(runtimes, 'manifest.json'));
    const locks = fs.readdirSync(runtimes).filter((name) => name.endsWith('.lock.json'));
    const manifest = { schemaVersion: 1,
      package: { name: pkg.name, id: PLUGIN_ID, version: pkg.version, platform: 'win32', arch: 'x64', entrypoint: 'workflow-plugin/main.js' },
      source, build: { publishable, nodeVersion: process.version },
      runtime: { manifestPath: 'resources/runtimes/manifest.json', manifestSha256: digest(fs.readFileSync(path.join(runtimes, 'manifest.json'))),
        profiles: runtimeManifest.profiles.map((profile) => {
          const name = locks.find((name) => readJson(path.join(runtimes, name)).profileId === profile.id);
          if (!name) throw new Error('Runtime profile lock missing');
          return { id: profile.id, version: profile.runtimeVersion, lockPath: `resources/runtimes/${name}`, lockSha256: digest(fs.readFileSync(path.join(runtimes, name))) };
        }) },
      native: { path: 'workflow-plugin/WorkflowIntegration.node', ...q.native, source: q.source, sdkVersion: q.sdkVersion,
        sdkEvidence: q.sdkEvidence, sourceArchiveSha256: q.sourceArchiveSha256, resolveVersions: q.resolveVersions,
        qualification: publishable ? 'release-qualified' : 'local-development', redistribution: q.redistribution }, files };
    fs.writeFileSync(path.join(plugin, RELEASE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    validatePlugin(plugin, pkg.version);
    const temporaryZip = path.join(temporary, `${name}.zip`);
    powershell(`Compress-Archive -LiteralPath ${quote(plugin)} -DestinationPath ${quote(temporaryZip)}`);
    const result = await verifyArchive(temporaryZip, pkg.version);
    fs.renameSync(temporaryZip, zipPath);
    return { zipPath, sha256: result.sha256, size: result.size, publishable, entries: files.length };
  } finally {
    // temporary was allocated directly inside the checked output root; reject redirected descendants.
    if (path.dirname(temporary) !== path.resolve(outputRoot)) throw new Error('Unsafe cleanup root');
    listTree(temporary); fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = (flag) => { const index = args.indexOf(flag); if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${flag} value`); return args[index + 1]; };
  (async () => {
    if (args.includes('--verify')) {
      const file = path.resolve(value('--verify'));
      const version = /^Clackly-Workflow-(.+)-win-x64\.zip$/.exec(path.basename(file))?.[1];
      const result = await verifyArchive(file, version);
      console.log(JSON.stringify({ zipPath: file, sha256: result.sha256, size: result.size, publishable: result.manifest.build.publishable }, null, 2));
    } else console.log(JSON.stringify(await buildWorkflow({ sourceRoot: value('--source-root'), outputRoot: value('--output') && path.resolve(value('--output')),
      qualificationFile: value('--qualification'), publishable: !args.includes('--nonpublishable'), tag: value('--tag') }), null, 2));
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { VERSION, RELEASE_MANIFEST, inventory, sourceIdentity, validateManifest, validateInventory, validatePlugin, validateDependencies, verifyArchive, buildWorkflow, powershell, quote };
