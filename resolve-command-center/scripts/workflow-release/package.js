const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { listTree, assertNormalExistingDirectory, readWorkflowManifest } = require('../package-internal-beta');
const { verifyPackage, assertProductPayload, PRODUCTION_INSTALLER_FILES } = require('../verify-package');
const { verifyZip } = require('../../electron/main/update/zip');
const { VERSION, RELEASE_MANIFEST, NATIVE_POLICY, validateManifest, validateInventory, validateRuntime } = require('../../electron/main/update/release-manifest');

const APP_ROOT = path.resolve(__dirname, '../..');
const PLUGIN_ID = 'com.wutpeach.clackly';
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const inventory = (root) => listTree(root, { exclude: new Set([RELEASE_MANIFEST]) })
  .map((item) => ({ path: item.relativePath, size: item.size, sha256: item.sha256.toLowerCase() }))
  .sort((a, b) => ordinal(a.path, b.path));

function git(args, appRoot = APP_ROOT) {
  return cp.execFileSync('git', args, { cwd: appRoot, encoding: 'utf8', windowsHide: true }).trim();
}
function sourceIdentity(version, { appRoot = APP_ROOT, publishable = true, tag = `v${version}`, environment = process.env } = {}) {
  if (!VERSION.test(version) || tag !== `v${version}`) throw new Error('Tag must exactly match v<package.json version>');
  const commit = git(['rev-parse', 'HEAD'], appRoot);
  const dirty = Boolean(git(['status', '--porcelain', '--untracked-files=normal'], appRoot));
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Source commit is invalid');
  if (publishable && dirty) throw new Error('Publication requires a clean committed worktree');
  if (publishable && git(['rev-parse', `${tag}^{commit}`], appRoot) !== commit) throw new Error('Tag must point to the exact source commit');
  if (publishable && environment.GITHUB_REF && environment.GITHUB_REF !== `refs/tags/${tag}`) throw new Error('Release runner ref differs from source tag');
  const workflowRef = environment.GITHUB_WORKFLOW_REF;
  const workflow = workflowRef && /^Wutpeach\/Clackly\/(\.github\/workflows\/(?:main|workflow-release)\.yml)@refs\/.+$/.exec(workflowRef);
  if (workflowRef && !workflow) throw new Error('Source workflow is not a canonical Clackly workflow');
  const workflowPath = workflow ? workflow[1] : null;
  if (publishable && workflowRef !== `Wutpeach/Clackly/.github/workflows/workflow-release.yml@refs/tags/${tag}`) throw new Error('Publication requires the canonical release workflow at the source tag');
  return { repository: 'Wutpeach/Clackly', tag, commit, dirty,
    workflowPath,
    runId: workflow ? environment.GITHUB_RUN_ID || null : null,
    runAttempt: workflow ? environment.GITHUB_RUN_ATTEMPT || null : null };
}

function validatePlugin(root, version) {
  assertNormalExistingDirectory(root);
  const manifest = validateManifest(readJson(path.join(root, RELEASE_MANIFEST)), version);
  if (JSON.stringify(inventory(root)) !== JSON.stringify(manifest.files)) throw new Error('Plugin inventory/hash differs from release manifest');
  assertProductPayload(manifest.files.map((item) => item.path));
  const pkg = readJson(path.join(root, 'package.json'));
  const xml = readWorkflowManifest(path.join(root, 'manifest.xml'));
  if (pkg.name !== 'clackly' || pkg.version !== version || xml.version !== version
    || !/<FilePath>\s*workflow-plugin\/main\.js\s*<\/FilePath>/.test(fs.readFileSync(path.join(root, 'manifest.xml'), 'utf8'))) throw new Error('Plugin entry/version mismatch');
  validateRuntime(manifest, (name) => readJson(path.join(root, name)));
  return manifest;
}

function validateDependencies(plugin, lock) {
  for (const [name, metadata] of Object.entries(lock.packages)) {
    if (!name || metadata.dev || metadata.optional) continue;
    const installed = readJson(path.join(plugin, name, 'package.json'));
    if (installed.version !== metadata.version) throw new Error(`Production dependency version mismatch: ${name}`);
  }
}

function validatePackagedSources(appRoot, plugin) {
  for (const file of ['dist/renderer/index.html', 'workflow-plugin/main.js',
    'electron/main/update/release-manifest.js', 'electron/main/update/zip.js', ...PRODUCTION_INSTALLER_FILES]) {
    if (digest(fs.readFileSync(path.join(appRoot, file))) !== digest(fs.readFileSync(path.join(plugin, file)))) {
      throw new Error('Packaged source is stale: ' + file);
    }
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
  // Local package verification also covers explicitly nonpublishable development ZIPs.
  // Download/restart callers retain verifyZip's production-only default.
  const result = await verifyZip(file, version, { allowNonpublishable: true });
  assertProductPayload(result.manifest.files.map((item) => item.path));
  return { manifest: result.manifest, sha256: digest(fs.readFileSync(file)), size: fs.statSync(file).size };
}

async function buildWorkflow({ appRoot = APP_ROOT, packageRoot = path.join(appRoot, 'release/win-unpacked'),
  outputRoot = path.join(appRoot, 'release/workflow'), publishable = true, tag } = {}) {
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
    validateDependencies(plugin, readJson(path.join(appRoot, 'package-lock.json')));
    validatePackagedSources(appRoot, plugin);
    const files = inventory(plugin);
    const runtimeManifest = readJson(path.join(runtimes, 'manifest.json'));
    const locks = fs.readdirSync(runtimes).filter((name) => name.endsWith('.lock.json'));
    const manifest = { schemaVersion: 2,
      package: { name: pkg.name, id: PLUGIN_ID, version: pkg.version, platform: 'win32', arch: 'x64', entrypoint: 'workflow-plugin/main.js' },
      source, build: { publishable, nodeVersion: process.version },
      runtime: { manifestPath: 'resources/runtimes/manifest.json', manifestSha256: digest(fs.readFileSync(path.join(runtimes, 'manifest.json'))),
        profiles: runtimeManifest.profiles.map((profile) => {
          const name = locks.find((name) => readJson(path.join(runtimes, name)).profileId === profile.id);
          if (!name) throw new Error('Runtime profile lock missing');
          return { id: profile.id, version: profile.runtimeVersion, lockPath: `resources/runtimes/${name}`, lockSha256: digest(fs.readFileSync(path.join(runtimes, name))) };
        }) },
      native: { ...NATIVE_POLICY }, files };
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
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--nonpublishable') continue;
      if (!['--verify', '--output', '--tag'].includes(args[index])) throw new Error(`Unknown release option: ${args[index]}`);
      value(args[index]); index++;
    }
    if (args.includes('--verify')) {
      const file = path.resolve(value('--verify'));
      const version = /^Clackly-Workflow-(.+)-win-x64\.zip$/.exec(path.basename(file))?.[1];
      const result = await verifyArchive(file, version);
      console.log(JSON.stringify({ zipPath: file, sha256: result.sha256, size: result.size, publishable: result.manifest.build.publishable }, null, 2));
    } else console.log(JSON.stringify(await buildWorkflow({ outputRoot: value('--output') && path.resolve(value('--output')),
      publishable: !args.includes('--nonpublishable'), tag: value('--tag') }), null, 2));
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { VERSION, RELEASE_MANIFEST, inventory, sourceIdentity, validateManifest, validateInventory, validatePlugin, validateDependencies, validatePackagedSources, verifyArchive, buildWorkflow, powershell, quote };
