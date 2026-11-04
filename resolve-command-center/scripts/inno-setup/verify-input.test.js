const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { payload, zipBuffer } = require('../../electron/main/update/fixtures');
const { verifyInput } = require('./verify-input');

test('Setup accepts same-commit nonpublishable development input while retaining release and integrity gates', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-inno-input-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'source'); fs.mkdirSync(appRoot);
  const git = (args) => cp.execFileSync('git', args, { cwd: appRoot, encoding: 'utf8', windowsHide: true }).trim();
  git(['init', '--quiet']);
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  git(['add', 'package.json']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  const entries = payload().map(([name, bytes]) => [name.replaceAll('python/test/', 'python/cpython/'),
    String(bytes).replaceAll('python/test/', 'python/cpython/')]);
  const manifestEntry = entries.find(([name]) => name === 'plugin/clackly-release.json');
  const manifest = JSON.parse(manifestEntry[1]);
  const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  manifest.files = entries.filter((entry) => entry !== manifestEntry).map(([name, bytes]) => ({
    path: name.slice(7), size: Buffer.byteLength(bytes), sha256: hash(bytes)
  })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  manifest.runtime.manifestSha256 = manifest.files.find((file) => file.path === manifest.runtime.manifestPath).sha256;
  manifest.source.commit = git(['rev-parse', 'HEAD']);
  manifest.source.dirty = false; manifest.source.workflowPath = null; manifest.build.publishable = false;
  const archive = path.join(root, 'Clackly-Workflow-0.2.0-win-x64.zip');
  const write = () => { manifestEntry[1] = JSON.stringify(manifest); fs.writeFileSync(archive, zipBuffer(entries)); };
  write();
  const accepted = await verifyInput(archive, { appRoot });
  assert.equal(accepted.version, '0.2.0'); assert.equal(accepted.publishable, false);
  assert.equal(accepted.source.commit, manifest.source.commit);
  manifest.source.commit = '0'.repeat(40); write();
  await assert.rejects(verifyInput(archive, { appRoot }), /this source commit/);
  manifest.source.commit = accepted.source.commit; manifest.source.dirty = true; write();
  assert.equal((await verifyInput(archive, { appRoot })).source.dirty, true);
  manifest.source.dirty = false; write();
  fs.writeFileSync(path.join(appRoot, 'uncommitted.txt'), 'dirty');
  assert.equal((await verifyInput(archive, { appRoot })).publishable, false);
  manifest.source.dirty = false; manifest.source.workflowPath = '.github/workflows/workflow-release.yml';
  manifest.build.publishable = true; write();
  await assert.rejects(verifyInput(archive, { appRoot }), /clean committed/);
  manifest.build.publishable = false; manifest.source.workflowPath = null; write();
  fs.unlinkSync(path.join(appRoot, 'uncommitted.txt'));
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ version: '0.3.0' }));
  await assert.rejects(verifyInput(archive, { appRoot }), /filename/);
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  fs.writeFileSync(archive, 'corrupt');
  await assert.rejects(verifyInput(archive, { appRoot }));
});
