const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { payload, zipBuffer } = require('../../electron/main/update/fixtures');
const { verifyZip } = require('../../electron/main/update/zip');
const { sourceIdentity, validateManifest, validateInventory, validatePlugin, verifyArchive, validateDependencies, validatePackagedSources, powershell, quote } = require('./package');
const { assertProductPayload, PRODUCTION_INSTALLER_FILES, verifyPackage } = require('../verify-package');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function fixture() {
  // Use a normal Runtime directory, keeping test fixture names out of product paths.
  const all = payload().map(([name, bytes]) => [name.replaceAll('python/test/', 'python/cpython/'),
    String(bytes).replaceAll('python/test/', 'python/cpython/')]);
  const manifest = JSON.parse(all.find(([name]) => name === 'plugin/clackly-release.json')[1]);
  manifest.build.publishable = false; manifest.source.dirty = true;
  const data = { entries: all.filter(([name]) => name !== 'plugin/clackly-release.json'), manifest };
  for (const file of PRODUCTION_INSTALLER_FILES) {
    if (!data.entries.some(([name]) => name === 'plugin/' + file)) data.entries.push(['plugin/' + file, 'inert executor']);
  }
  refreshInventory(data);
  return data;
}
function refreshInventory(data) {
  data.manifest.files = data.entries.map(([name, bytes]) => ({ path: name.slice(7),
    size: Buffer.byteLength(bytes), sha256: hash(bytes) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  data.manifest.runtime.manifestSha256 = data.manifest.files.find((item) => item.path === data.manifest.runtime.manifestPath).sha256;
}
function writePlugin(root, data) {
  for (const [name, bytes] of [...data.entries, ['plugin/clackly-release.json', JSON.stringify(data.manifest)]]) {
    const file = path.join(root, name.slice(7));
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  }
}
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function archive(root, data, change = (i) => i) {
  const file = path.join(root, 'Clackly-Workflow-0.2.0-win-x64.zip');
  fs.writeFileSync(file, zipBuffer(change([...data.entries, ['plugin/clackly-release.json', JSON.stringify(data.manifest)]]))); return file;
}
test('complete ZIP verifies exact bytes and explicit nonpublication', async (t) => {
  const file = archive(workspace(t), fixture()); const result = await verifyArchive(file, '0.2.0');
  assert.equal(result.sha256, hash(fs.readFileSync(file))); assert.equal(result.manifest.build.publishable, false);
  assert.equal(result.manifest.schemaVersion, 2);
  assert.equal(result.manifest.native.provisioning, 'local-resolve');
  assert.equal(result.manifest.files.some((i) => i.path.endsWith('WorkflowIntegration.node')), false);
  assert.equal(result.manifest.files.some((i) => i.path === 'clackly-release.json'), false);
});
test('ZIP rejects corruption, extra/missing files, wrong package identity and filename/version', async (t) => {
  const root = workspace(t);
  for (const change of [
    (i) => i.map(([n, b]) => [n, n.endsWith('executor.ps1') ? 'tampered' : b]),
    (i) => [...i, ['plugin/unlisted.js', 'extra']], (i) => i.filter(([n]) => !n.endsWith('launch.ps1')),
    (i) => i.filter(([n]) => !n.endsWith('clackly-release.json')),
    (i) => i.map(([n, b]) => [n, n === 'plugin/package.json' ? '{"name":"foreign","version":"0.2.0"}' : b])
  ]) await assert.rejects(verifyArchive(archive(root, fixture(), change), '0.2.0'));
  await assert.rejects(verifyArchive(archive(root, fixture()), '0.3.0'), /filename/);
});
test('manifest rejects invalid provenance, version, runtime/native and false publication', () => {
  for (const change of [(m) => { m.source.repository = 'foreign/repo'; }, (m) => { m.source.tag = 'v0.3.0'; },
    (m) => { m.source.commit = 'HEAD'; }, (m) => { m.source.workflowPath = '.github/workflows/foreign.yml'; },
    (m) => { delete m.source.workflowPath; }, (m) => { m.package.entrypoint = 'electron.exe'; },
    (m) => { m.runtime.manifestSha256 = '0'.repeat(64); }, (m) => { m.native.sha256 = '0'.repeat(64); },
    (m) => { m.build.publishable = true; }, (m) => { m.schemaVersion = 1; }, (m) => { m.files.reverse(); }]) {
    const { manifest } = fixture(); change(manifest); assert.throws(() => validateManifest(manifest, '0.2.0'));
  }
});

const contaminants = [
  'electron/main/update/UpdateService.test.js', 'electron/main/update/windows.integration.js',
  'electron/main/update/fixtures.js', 'electron/main/update/file-storage-fixture.js',
  'script-runtime/runtime/fixtures/test_worker.py', 'resolve2ae_core/tests/snapshot.json',
  'resolve/test_export.py', 'resolve/export.otio', 'resolve/export.aep',
  'electron/main/diagnostics/receipt.json', 'scripts/diagnostic-sampler/receipt.json',
  '.trellis/tasks/local-evidence.json', 'private/receipt.json', 'sdk/SamplePlugin/readme.txt',
  'resources/runtimes/python/cpython/clackly/tests/fixture.py', 'node_modules/example/tests/fixture.json',
  'capability/unexpected.node', 'resolve/feasibility/scripts/Clackly_Spike_0911_Lua.lua',
  'resolve/feasibility/scripts/Clackly_Spike_0911_Python.py'
];

test('complete hash inventories cannot qualify nonproduct staged trees or ZIPs', async (t) => {
  const root = workspace(t);
  for (const file of contaminants) {
    const data = fixture();
    // Deliberately include the historical small OTIO size; no byte-count exemption.
    data.entries.push(['plugin/' + file, file.endsWith('.otio') ? 'x'.repeat(606) : 'inert nonproduct fixture']);
    refreshInventory(data);
    const zip = archive(root, data);
    await verifyZip(zip, '0.2.0', { allowNonpublishable: true });
    await assert.rejects(verifyArchive(zip, '0.2.0'), /Nonproduct release payload/, file);
    const plugin = path.join(root, String(contaminants.indexOf(file))); writePlugin(plugin, data);
    assert.throws(() => validatePlugin(plugin, '0.2.0'), /Nonproduct release payload/, file);
    const packageRoot = path.join(root, 'package-' + contaminants.indexOf(file));
    writePlugin(path.join(packageRoot, 'resources/app'), data);
    await assert.rejects(verifyPackage({ packageRoot }), /Nonproduct release payload/, file);
  }
});

test('electron-builder selects runnable product sources and dependencies while omitting nonproduct files', (t) => {
  const root = workspace(t);
  const kept = ['package.json', 'manifest.xml', 'workflow-plugin/main.js', 'dist/renderer/index.html',
    'dist/renderer/assets/renderer.js', 'electron/main/main.js', 'electron/main/preload.js',
    'electron/shared/palette-geometry.json', 'app/createClacklyCore.js', 'capability/script.js',
    'command-engine/commands/after-effects.json', 'localization/resources.mjs', 'resolve/adapter.py',
    'resolve/ordinary_scripts.py', 'resolve2ae_core/export.py', 'script-runtime/runtime/bootstrap.py',
    'script-runtime/runtime/launcher.js', 'scripts/resolve2ae_export.py', 'node_modules/react/index.js',
    'node_modules/react/LICENSE', ...PRODUCTION_INSTALLER_FILES];
  const omitted = [...contaminants, 'build/test-evidence/receipt.json', 'release/old.zip',
    'scripts/workflow-update/LocalNativeDiagnostics.test.ps1', 'scripts/workflow-release/package.js',
    'electron/renderer/settingsUpdateFixture.mjs', 'workflow-plugin/WorkflowIntegration.node'];
  for (const file of [...kept, ...omitted]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), 'inert');
  }
  const { FileMatcher, getNodeModuleFileMatcher } = require('app-builder-lib/out/fileMatcher');
  const files = require('../../package.json').build.files;
  const filter = new FileMatcher(root, root, (pattern) => pattern, files).createFilter();
  const selected = [];
  function visit(directory, select = filter) {
    for (const item of fs.readdirSync(directory)) {
      const file = path.join(directory, item); const stat = fs.statSync(file);
      if (!select(file, stat)) continue;
      if (stat.isDirectory()) visit(file, select); else selected.push(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  visit(root);
  // electron-builder walks production dependencies separately from app files.
  const dependencyFilter = getNodeModuleFileMatcher(root, root, (pattern) => pattern, {},
    { config: { files }, debugLogger: { isEnabled: false } }).createFilter();
  visit(path.join(root, 'node_modules'), dependencyFilter);
  assert.deepEqual(selected.sort(), kept.sort());
  assertProductPayload(selected);
});

test('release identity agrees across package, lock roots and Workflow XML', () => {
  const pkg = require('../../package.json'); const lock = require('../../package-lock.json');
  const { readWorkflowManifest } = require('../package-internal-beta');
  assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(readWorkflowManifest(path.resolve(__dirname, '../../manifest.xml')).version, pkg.version);
});

test('excluding installer tests preserves exact production executor source verification', (t) => {
  const root = workspace(t); const appRoot = path.join(root, 'source'); const plugin = path.join(root, 'plugin');
  const files = ['dist/renderer/index.html', 'workflow-plugin/main.js',
    'electron/main/update/release-manifest.js', 'electron/main/update/zip.js', ...PRODUCTION_INSTALLER_FILES];
  for (const tree of [appRoot, plugin]) {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), { recursive: true }); fs.writeFileSync(path.join(tree, file), 'current product');
    }
  }
  // Repository-only tests need no matching packaged copy.
  fs.writeFileSync(path.join(appRoot, 'scripts/workflow-update/LocalNativeDiagnostics.test.ps1'), 'inert test');
  validatePackagedSources(appRoot, plugin);
  for (const file of files) {
    fs.writeFileSync(path.join(plugin, file), 'stale product');
    assert.throws(() => validatePackagedSources(appRoot, plugin), /Packaged source is stale/, file);
    fs.writeFileSync(path.join(plugin, file), 'current product');
  }
  fs.unlinkSync(path.join(plugin, 'scripts/workflow-update/LocalNative.psm1'));
  assert.throws(() => validatePackagedSources(appRoot, plugin), { code: 'ENOENT' });
});
test('main and local development ZIP provenance never passes production verification', async (t) => {
  const root = workspace(t);
  for (const workflowPath of ['.github/workflows/main.yml', null]) {
    const data = fixture(); data.manifest.source.workflowPath = workflowPath;
    const file = archive(root, data);
    assert.equal((await verifyArchive(file, '0.2.0')).manifest.source.workflowPath, workflowPath);
    await assert.rejects(verifyZip(file, '0.2.0'), { code: 'invalid-zip' });
    data.manifest.source.dirty = false; data.manifest.build.publishable = true;
    await assert.rejects(verifyArchive(archive(root, data), '0.2.0'), { code: 'invalid-zip' });
  }
});

test('PowerShell package and production gates distinguish development workflow provenance', { skip: process.platform !== 'win32' }, (t) => {
  const root = fs.realpathSync.native(workspace(t)); const data = fixture();
  for (const [name, bytes] of data.entries) {
    const file = path.join(root, name.slice(7));
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  }
  fs.writeFileSync(path.join(root, 'clackly-release.json'), JSON.stringify(data.manifest));
  powershell(`
    Import-Module ${quote(path.resolve(__dirname, '../workflow-update/WorkflowTransaction.psm1'))} -Force -DisableNameChecking;
    Import-Module ${quote(path.resolve(__dirname, '../workflow-update/ExecutorSupport.psm1'))} -Force -DisableNameChecking;
    $root = ${quote(root)}; $file = Join-Path $root 'clackly-release.json';
    $manifest = Read-UpdateJson $file; $manifest.source.dirty = $false;
    foreach ($publishable in @($false, $true)) {
      foreach ($workflow in @('.github/workflows/workflow-release.yml', '.github/workflows/main.yml', $null, '.github/workflows/foreign.yml', '')) {
        $manifest.build.publishable = $publishable; $manifest.source.workflowPath = $workflow;
        [IO.File]::WriteAllText($file, ($manifest | ConvertTo-Json -Depth 12));
        $expected = $workflow -ceq '.github/workflows/workflow-release.yml' -or
          (!$publishable -and ($null -eq $workflow -or $workflow -ceq '.github/workflows/main.yml'));
        $accepted = $false; $production = $false;
        try { $verified = Assert-UpdatePackage $root '0.2.0'; $accepted = $true;
          Assert-PublishedUpdatePackage $verified; $production = $true;
        } catch { if ($_.Exception.Message -cne 'invalid-package') { throw } }
        if ($accepted -ne $expected -or $production -ne ($expected -and $publishable)) { throw 'Incorrect workflow publication qualification' }
      }
    }
    $manifest.source.PSObject.Properties.Remove('workflowPath');
    [IO.File]::WriteAllText($file, ($manifest | ConvertTo-Json -Depth 12));
    $accepted = $false; try { Assert-UpdatePackage $root '0.2.0' | Out-Null; $accepted = $true } catch {}
    if ($accepted) { throw 'Missing workflow provenance accepted' }
    Write-Output 'PASS workflow provenance matrix';
  `);
});

test('publication uses a clean exact source and local-native policy without an SDK pin', () => {
  const { manifest } = fixture();
  manifest.build.publishable = true; manifest.source.dirty = false;
  assert.equal(validateManifest(manifest, '0.2.0'), manifest);
  assert.deepEqual(Object.keys(manifest.native).sort(), ['arch', 'path', 'platform', 'provisioning', 'source']);
});

test('staged release tree rejects an ignored native copy before archiving', (t) => {
  const root = workspace(t); const data = fixture();
  for (const [name, bytes] of data.entries) {
    const file = path.join(root, name.slice(7));
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  }
  fs.writeFileSync(path.join(root, 'clackly-release.json'), JSON.stringify(data.manifest));
  validatePlugin(root, '0.2.0');
  fs.writeFileSync(path.join(root, 'workflow-plugin/WorkflowIntegration.node'), 'ignored machine-local bytes');
  assert.throws(() => validatePlugin(root, '0.2.0'), /inventory/);
});
test('ZIP rejects a Runtime manifest pointing to an absent executable despite complete sibling files', async (t) => {
  const data = fixture();
  const name = 'plugin/resources/runtimes/manifest.json';
  const entry = data.entries.find(([path]) => path === name);
  const runtime = JSON.parse(entry[1]);
  runtime.profiles[0].executable = 'python/test/missing.exe';
  entry[1] = JSON.stringify(runtime);
  const record = data.manifest.files.find((item) => item.path === name.slice(7));
  record.size = Buffer.byteLength(entry[1]); record.sha256 = hash(entry[1]);
  data.manifest.runtime.manifestSha256 = record.sha256;
  await assert.rejects(verifyArchive(archive(workspace(t), data), '0.2.0'), /invalid-zip/);
});
test('inventory blocks traversal, Windows aliases, collisions, self entry and unsorted paths', () => {
  const item = (p) => ({ path: p, size: 1, sha256: hash('x') });
  for (const files of [[item('../escape')], [item('NUL.txt')], [item('a:b')], [item('dir/file. ')],
    [item('a'), item('A')], [item('a'), item('a')], [item('z'), item('a')], [item('clackly-release.json')],
    [item('workflow-plugin/WorkflowIntegration.node')], [item('hidden/workflowintegration.NODE')]]) assert.throws(() => validateInventory(files));
});
test('source identity rejects tag mismatch and production dirty state', () => {
  assert.throws(() => sourceIdentity('01.2.0', { publishable: false }), /Tag/);
  assert.throws(() => sourceIdentity('0.1.0', { tag: 'v0.2.0', publishable: false }), /Tag/);
  const version = require('../../package.json').version;
  const source = sourceIdentity(version, { publishable: false }); assert.match(source.commit, /^[a-f0-9]{40}$/);
  if (source.dirty) assert.throws(() => sourceIdentity(version), /clean committed/);
});
test('source identity records actual local/main/release origin and retains exact-tag publication gates', (t) => {
  const root = workspace(t); const version = '0.2.0';
  const git = (args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  git(['init', '--quiet']); fs.writeFileSync(path.join(root, 'source.txt'), 'fixture'); git(['add', 'source.txt']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  git(['tag', 'v0.2.0']);
  const identity = (environment, publishable = false) => sourceIdentity(version, { appRoot: root, publishable, environment });
  const main = { GITHUB_WORKFLOW_REF: 'Wutpeach/Clackly/.github/workflows/main.yml@refs/heads/main',
    GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };
  const release = { ...main, GITHUB_WORKFLOW_REF: 'Wutpeach/Clackly/.github/workflows/workflow-release.yml@refs/tags/v0.2.0', GITHUB_REF: 'refs/tags/v0.2.0' };
  const local = identity({ GITHUB_WORKFLOW: 'Windows Workflow draft release', GITHUB_RUN_ID: 'fictional' });
  assert.equal(local.workflowPath, null); assert.equal(local.runId, null); assert.equal(local.runAttempt, null);
  const fromMain = identity(main);
  assert.equal(fromMain.workflowPath, '.github/workflows/main.yml'); assert.equal(fromMain.runId, '123'); assert.equal(fromMain.runAttempt, '2');
  assert.equal(identity({ ...main, GITHUB_WORKFLOW_REF: main.GITHUB_WORKFLOW_REF.replace('refs/heads/main', 'refs/pull/1/merge') }).workflowPath, '.github/workflows/main.yml');
  assert.equal(identity(release, true).workflowPath, '.github/workflows/workflow-release.yml');
  assert.throws(() => identity({}, true), /canonical release workflow/);
  assert.throws(() => identity({ ...main, GITHUB_REF: release.GITHUB_REF }, true), /canonical release workflow/);
  for (const workflowRef of ['foreign/Clackly/.github/workflows/main.yml@refs/heads/main',
    'Wutpeach/Clackly/.github/workflows/foreign.yml@refs/heads/main']) {
    assert.throws(() => identity({ ...main, GITHUB_WORKFLOW_REF: workflowRef }), /canonical Clackly workflow/);
  }
  assert.throws(() => identity({ ...release, GITHUB_REF: 'refs/heads/main' }, true), /runner ref/);
  assert.throws(() => identity({ ...release, GITHUB_WORKFLOW_REF: release.GITHUB_WORKFLOW_REF.replace('v0.2.0', 'v0.1.0') }, true), /canonical release workflow/);
  fs.writeFileSync(path.join(root, 'source.txt'), 'new fixture'); git(['add', 'source.txt']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'next fixture']);
  assert.throws(() => identity(release, true), /exact source commit/);
});
test('production dependencies must match exact locked version', (t) => {
  const root = workspace(t); const dir = path.join(root, 'node_modules/example'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"1.0.0"}');
  const lock = { packages: { '': {}, 'node_modules/example': { version: '1.0.0' }, 'node_modules/dev': { dev: true } } };
  validateDependencies(root, lock); lock.packages['node_modules/example'].version = '2.0.0';
  assert.throws(() => validateDependencies(root, lock), /dependency version/);
});
