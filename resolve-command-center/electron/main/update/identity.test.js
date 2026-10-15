const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { stableVersion, installedVersion, selectRelease, manifestIdentity } = require('./identity');
const { release, workspace, manifest } = require('./fixtures');
test('strict stable SemVer and newest official asset selection', () => {
  for (const value of ['01.2.3', '1.2', 'v1.2.3', '1.2.3-alpha', '1.2.3+build', null, ' 1.2.3']) assert.equal(stableVersion(value), null);
  assert.equal(stableVersion('1.2.3'), '1.2.3');
  assert.equal(selectRelease([], '0.1.0').status, 'no-release');
  assert.equal(selectRelease([release(undefined, '0.9.0'), release(undefined, '0.10.0')], '0.1.0').release.version, '0.10.0');
  assert.equal(selectRelease([release()], '0.2.0').status, 'up-to-date');
  for (const extra of [{ draft: true }, { prerelease: true }, { tag_name: 'v0.3.0-rc.1' }]) {
    assert.equal(selectRelease([{ ...release(), ...extra }], '0.1.0').status, 'no-release');
  }
});
test('missing/doubled/source archives, absent hashes and foreign URLs are unavailable', () => {
  const candidate = release();
  for (const assets of [[], [candidate.assets[0], candidate.assets[0]], [{ ...candidate.assets[0], name: 'source.zip' }],
    [{ ...candidate.assets[0], digest: null }], [{ ...candidate.assets[0], size: 2 ** 40 }],
    [{ ...candidate.assets[0], browser_download_url: candidate.assets[0].browser_download_url.replace('Wutpeach', 'attacker') }]]) {
    assert.equal(selectRelease([{ ...candidate, assets }], '0.1.0').status, 'unavailable');
  }
});
test('installed authority fails closed on bundled version/id/entry mismatch', async (t) => {
  const { appRoot } = await workspace(t);
  assert.equal(installedVersion(appRoot), '0.1.0');
  for (const text of [manifest('0.2.0'), manifest('0.1.0', 'foreign'), manifest('0.1.0', undefined, '../evil.js')]) {
    await fs.writeFile(path.join(appRoot, 'manifest.xml'), text);
    assert.equal(installedVersion(appRoot), null);
  }
  assert.throws(() => manifestIdentity(manifest().replace('</Plugin>', '<Version>0.2.0</Version></Plugin>')));
});
