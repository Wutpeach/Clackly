const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { payload, zipBuffer } = require('../../electron/main/update/fixtures');
const { sourceIdentity, validateManifest, validateInventory, verifyArchive, validateDependencies } = require('./package');
const { readQualification, verifyOfficialNative } = require('./qualification');
const { inspectArchive, provision } = require('./provision');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function fixture() {
  const executable = 'python/test/python.exe';
  const runtime = { schemaVersion: 1, profiles: [{ id: 'python-test', runtimeVersion: '3.14.4', platform: 'win32', architecture: 'x64', executable }] };
  const lock = JSON.stringify({ profileId: 'python-test', version: '3.14.4', asset: { sha256: hash('asset') } });
  const native = Buffer.alloc(128); native.write('MZ'); native.writeUInt32LE(64, 60); native.write('PE\0\0', 64, 'ascii'); native.writeUInt16LE(0x8664, 68);
  const entries = [...payload().map(([name, bytes]) => [name, name.endsWith('.node') ? native : name === 'plugin/resources/runtimes/manifest.json' ? JSON.stringify(runtime) : bytes]),
    ['plugin/electron/main/update/UpdateService.js', 'service'],
    ...['WorkflowTransaction.psm1', 'executor.ps1', 'launch.ps1', 'recover.ps1'].map((name) => ['plugin/scripts/workflow-update/' + name, 'executor']),
    ['plugin/resources/runtimes/python.lock.json', lock],
    ['plugin/resources/runtimes/python/test/runtime.json', JSON.stringify({ runtimeVersion: '3.14.4', source: { sha256: hash('asset') }, build: { lockSha256: hash(lock), applicationSources: [] } })],
    ...['python.exe', 'python314.dll', 'python314.zip', 'python314._pth', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'python-embed.sigstore',
      'python-embed.spdx.json', 'application.spdx.json', 'clackly/bootstrap.py', 'clackly/persistent_bootstrap.py', 'clackly/python_runner.py']
      .map((name) => ['plugin/resources/runtimes/python/test/' + name, 'runtime'])];
  const files = entries.map(([name, data]) => ({ path: name.slice(7), size: Buffer.byteLength(data), sha256: hash(data) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const manifest = { schemaVersion: 1, package: { name: 'clackly', id: 'com.wutpeach.clackly', version: '0.2.0', platform: 'win32', arch: 'x64', entrypoint: 'workflow-plugin/main.js' },
    source: { repository: 'Wutpeach/Clackly', tag: 'v0.2.0', commit: 'a'.repeat(40), dirty: true, workflowPath: '.github/workflows/workflow-release.yml' }, build: { publishable: false },
    runtime: { manifestPath: 'resources/runtimes/manifest.json', manifestSha256: files.find((i) => i.path === 'resources/runtimes/manifest.json').sha256,
      profiles: [{ id: 'python-test', version: '3.14.4', lockPath: 'resources/runtimes/python.lock.json', lockSha256: hash(lock) }] },
    native: { ...files.find((i) => i.path.endsWith('.node')), source: 'Blackmagic Design/Workflow Integration/Examples/SamplePlugin', sdkVersion: null,
      sourceArchiveSha256: null, resolveVersions: [], qualification: 'local-development', redistribution: { status: 'unverified', evidenceRef: null } }, files };
  return { entries, manifest };
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
  assert.equal(result.manifest.native.sdkVersion, null);
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
    (m) => { m.build.publishable = true; m.source.dirty = false; }, (m) => { m.files.reverse(); }]) {
    const { manifest } = fixture(); change(manifest); assert.throws(() => validateManifest(manifest, '0.2.0'));
  }
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
  await assert.rejects(verifyArchive(archive(workspace(t), data), '0.2.0'), /Runtime executable/);
});
test('inventory blocks traversal, Windows aliases, collisions, self entry and unsorted paths', () => {
  const item = (p) => ({ path: p, size: 1, sha256: hash('x') });
  for (const files of [[item('../escape')], [item('NUL.txt')], [item('a:b')], [item('dir/file. ')],
    [item('a'), item('A')], [item('a'), item('a')], [item('z'), item('a')], [item('clackly-release.json')]]) assert.throws(() => validateInventory(files));
});
test('qualification blocks absent official input and verifies pinned x64 native without loading it', (t) => {
  const q = readQualification(); assert.throws(() => readQualification(undefined, { publishable: true }), /Official SDK input blocked/);
  const root = workspace(t); const file = path.join(root, q.samplePath); fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = Buffer.alloc(128); bytes.write('MZ'); bytes.writeUInt32LE(64, 60); bytes.write('PE\0\0', 64, 'ascii'); bytes.writeUInt16LE(0x8664, 68);
  fs.writeFileSync(file, bytes); const local = { ...q, native: { size: bytes.length, sha256: hash(bytes) } };
  assert.equal(verifyOfficialNative(root, local), file);
  bytes.writeUInt16LE(0x14c, 68); fs.writeFileSync(file, bytes); assert.throws(() => verifyOfficialNative(root, local), /pinned/);
  assert.throws(() => verifyOfficialNative(root, { ...local, native: { ...local.native, sha256: hash(bytes) } }), /x64/);
});

test('V1 publication requires archive and terms evidence without invented SDK/host qualifications', (t) => {
  const root = workspace(t); const file = path.join(root, 'qualification.json');
  const q = { ...readQualification(), sourceArchiveSha256: hash('fixture archive') };
  const write = () => fs.writeFileSync(file, JSON.stringify(q)); write();
  readQualification(file, { archive: true });
  assert.throws(() => readQualification(file, { publishable: true }), /once-only official SDK terms/);
  q.redistribution = { status: 'approved', evidenceRef: 'synthetic-test-only' }; write();
  const result = readQualification(file, { publishable: true });
  assert.equal(result.sdkVersion, null); assert.deepEqual(result.resolveVersions, []);
  const { manifest } = fixture();
  manifest.build.publishable = true; manifest.source.dirty = false;
  Object.assign(manifest.native, { qualification: 'release-qualified', sourceArchiveSha256: q.sourceArchiveSha256, redistribution: q.redistribution });
  validateManifest(manifest, '0.2.0');
});
test('source identity rejects tag mismatch and production dirty state', () => {
  assert.throws(() => sourceIdentity('01.2.0', { publishable: false }), /Tag/);
  assert.throws(() => sourceIdentity('0.1.0', { tag: 'v0.2.0', publishable: false }), /Tag/);
  const version = require('../../package.json').version;
  const source = sourceIdentity(version, { publishable: false }); assert.match(source.commit, /^[a-f0-9]{40}$/);
  if (source.dirty) assert.throws(() => sourceIdentity(version), /clean committed/);
});
test('production dependencies must match exact locked version', (t) => {
  const root = workspace(t); const dir = path.join(root, 'node_modules/example'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"1.0.0"}');
  const lock = { packages: { '': {}, 'node_modules/example': { version: '1.0.0' }, 'node_modules/dev': { dev: true } } };
  validateDependencies(root, lock); lock.packages['node_modules/example'].version = '2.0.0';
  assert.throws(() => validateDependencies(root, lock), /dependency version/);
});
test('official SDK provisioning rejects unsafe ZIPs and remains blocked without an archive pin', async (t) => {
  const root = workspace(t); const file = path.join(root, 'official-workflow-sdk.zip');
  const required = ['Examples/SamplePlugin/WorkflowIntegration.node', 'native'];
  fs.writeFileSync(file, zipBuffer([required])); await inspectArchive(file);
  for (const attack of [['../escape', 'x'], ['Examples/SamplePlugin/NUL', 'x'], ['Examples/SamplePlugin/link', 'x', { attributes: 0xa1ff0000 }],
    ['examples/SamplePlugin/extra', 'x'], ['Examples/SamplePlugin/WorkflowIntegration.node/child', 'x']]) {
    fs.writeFileSync(file, zipBuffer([required, attack])); await assert.rejects(inspectArchive(file));
  }
  await assert.rejects(provision({ archive: file, outputRoot: path.join(root, 'sdk') }), /Official SDK input blocked/);
  assert.equal(fs.existsSync(path.join(root, 'sdk')), false);
});

test('pinned SDK provisioning extracts only verified native bytes without requiring public redistribution', { skip: process.platform !== 'win32' }, async (t) => {
  const root = workspace(t); const file = path.join(root, 'official-workflow-sdk.zip');
  const native = Buffer.alloc(128); native.write('MZ'); native.writeUInt32LE(64, 60);
  native.write('PE\0\0', 64, 'ascii'); native.writeUInt16LE(0x8664, 68);
  fs.writeFileSync(file, zipBuffer([['Examples/SamplePlugin/WorkflowIntegration.node', native]]));
  const qualificationFile = path.join(root, 'qualification.json');
  const q = { ...readQualification(), sourceArchiveSha256: hash(fs.readFileSync(file)), native: { size: native.length, sha256: hash(native) } };
  fs.writeFileSync(qualificationFile, JSON.stringify(q));
  const outputRoot = path.join(root, 'sdk');
  await assert.rejects(provision({ archive: file, outputRoot, qualificationFile, publishable: true }), /Publication blocked/);
  assert.equal(fs.existsSync(outputRoot), false);
  q.sourceArchiveSha256 = hash('wrong archive'); fs.writeFileSync(qualificationFile, JSON.stringify(q));
  await assert.rejects(provision({ archive: file, outputRoot, qualificationFile }), /archive SHA-256/);
  assert.equal(fs.existsSync(outputRoot), false);
  q.sourceArchiveSha256 = hash(fs.readFileSync(file)); fs.writeFileSync(qualificationFile, JSON.stringify(q));
  await provision({ archive: file, outputRoot, qualificationFile });
  assert.deepEqual(fs.readFileSync(path.join(outputRoot, q.samplePath)), native);
  await assert.rejects(provision({ archive: file, outputRoot, qualificationFile }), /must be new/);
});
