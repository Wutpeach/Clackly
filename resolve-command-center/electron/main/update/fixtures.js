// Offline test data only; never imported by either production host.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
function manifest(version = '0.2.0', id = 'com.wutpeach.clackly', entry = 'workflow-plugin/main.js') {
  return `<BlackmagicDesign><Plugin><Id>${id}</Id><Version>${version}</Version><FilePath>${entry}</FilePath></Plugin></BlackmagicDesign>`;
}
function payload(version = '0.2.0') {
  const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  const runtime = { schemaVersion: 1, profiles: [{ id: 'python-test', runtimeVersion: '3.14.4', platform: 'win32', architecture: 'x64', executable: 'python/test/python.exe' }] };
  const lock = JSON.stringify({ profileId: 'python-test', version: '3.14.4', asset: { sha256: hash('asset') } });
  const entries = [
    ['plugin/package.json', JSON.stringify({ name: 'clackly', version })],
    ['plugin/manifest.xml', manifest(version)], ['plugin/workflow-plugin/main.js', 'const PLUGIN_ID = "com.wutpeach.clackly"; module.exports = {};'],
    ['plugin/dist/renderer/index.html', '<html></html>'], ['plugin/resources/runtimes/manifest.json', JSON.stringify(runtime)],
    ['plugin/electron/main/update/UpdateService.js', 'service'],
    ...['WorkflowTransaction.psm1', 'executor.ps1', 'launch.ps1', 'recover.ps1'].map((name) => ['plugin/scripts/workflow-update/' + name, 'executor']),
    ['plugin/resources/runtimes/python.lock.json', lock],
    ['plugin/resources/runtimes/python/test/runtime.json', JSON.stringify({ runtimeVersion: '3.14.4', source: { sha256: hash('asset') }, build: { lockSha256: hash(lock), applicationSources: [] } })],
    ...['python.exe', 'python314.dll', 'python314.zip', 'python314._pth', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'python-embed.sigstore',
      'python-embed.spdx.json', 'application.spdx.json', 'clackly/bootstrap.py', 'clackly/persistent_bootstrap.py', 'clackly/python_runner.py']
      .map((name) => ['plugin/resources/runtimes/python/test/' + name, 'runtime'])
  ];
  const files = entries.map(([name, bytes]) => ({ path: name.slice(7), size: Buffer.byteLength(bytes), sha256: hash(bytes) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const releaseManifest = { schemaVersion: 2,
    package: { name: 'clackly', id: 'com.wutpeach.clackly', version, platform: 'win32', arch: 'x64', entrypoint: 'workflow-plugin/main.js' },
    source: { repository: 'Wutpeach/Clackly', tag: 'v' + version, commit: 'a'.repeat(40), dirty: false, workflowPath: '.github/workflows/workflow-release.yml' },
    build: { publishable: true },
    runtime: { manifestPath: 'resources/runtimes/manifest.json', manifestSha256: hash(JSON.stringify(runtime)),
      profiles: [{ id: 'python-test', version: '3.14.4', lockPath: 'resources/runtimes/python.lock.json', lockSha256: hash(lock) }] },
    native: { path: 'workflow-plugin/WorkflowIntegration.node', provisioning: 'local-resolve', source: 'programdata-sampleplugin', platform: 'win32', arch: 'x64' }, files };
  return [...entries, ['plugin/clackly-release.json', JSON.stringify(releaseManifest)]];
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipBuffer(entries = payload()) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text, options = {}] of entries) {
    const filename = Buffer.from(name);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(options.flags || 0, 8);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(options.uncompressedSize ?? data.length, 24); central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(options.attributes ?? 0x81a40000, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); centrals.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function release(bytes = zipBuffer(), version = '0.2.0') {
  const name = `Clackly-Workflow-${version}-win-x64.zip`;
  return { id: 12, tag_name: `v${version}`, draft: false, prerelease: false, body: 'Offline fixture release',
    assets: [{ id: 25, name, state: 'uploaded', size: bytes.length, content_type: 'application/zip',
      digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      browser_download_url: `https://github.com/Wutpeach/Clackly/releases/download/v${version}/${name}` }] };
}
function response(bytes, signal) {
  const stream = Readable.from([bytes.subarray(0, 150), bytes.subarray(150)]);
  stream.headers = { 'content-length': String(bytes.length) };
  const abort = () => stream.destroy(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  stream.on('close', () => signal?.removeEventListener('abort', abort));
  return stream;
}
async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clackly-update-test-'));
  const appRoot = path.join(root, 'app'); const cacheRoot = path.join(root, 'cache');
  await fs.mkdir(appRoot);
  await fs.writeFile(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'clackly', version: '0.1.0' }));
  await fs.writeFile(path.join(appRoot, 'manifest.xml'), manifest('0.1.0'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
  return { root, appRoot, cacheRoot };
}
module.exports = { manifest, payload, zipBuffer, release, response, workspace };
